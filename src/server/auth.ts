import { Google } from "arctic";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { config } from "../config.ts";
import { db } from "../services/db.ts";

// Type for our context variables
type Variables = {
  session: Session;
  userEmail: string;
};

// Initialize Google OAuth
const google = new Google(
  config.google.clientId,
  config.google.clientSecret,
  "http://localhost:3000/auth/callback" // Will need to be updated for production
);

// Session management
interface Session {
  id: string;
  user_email: string;
  created_at: string;
  expires_at: string;
}

function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export function createSession(email: string): Session {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  db.prepare(`
    INSERT INTO sessions (id, user_email, expires_at)
    VALUES (?, ?, ?)
  `).run(id, email, expiresAt.toISOString());

  return {
    id,
    user_email: email,
    created_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

export function getSession(id: string): Session | null {
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')
  `).get(id) as Session | null;

  return session;
}

export function deleteSession(id: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

// Clean up expired sessions periodically
export function cleanupSessions(): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

// OAuth state storage (in-memory for simplicity, could use DB)
const oauthStates = new Map<string, { codeVerifier: string; createdAt: number }>();

// Clean up old states periodically
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [state, data] of oauthStates) {
    if (data.createdAt < fiveMinutesAgo) {
      oauthStates.delete(state);
    }
  }
}, 60 * 1000);

// Auth routes
export function getAuthRoutes() {
  return {
    // Initiate OAuth flow
    async login(c: Context) {
      const state = generateSessionId();
      const codeVerifier = generateSessionId();

      oauthStates.set(state, { codeVerifier, createdAt: Date.now() });

      const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);

      return c.redirect(url.toString());
    },

    // OAuth callback
    async callback(c: Context) {
      const code = c.req.query("code");
      const state = c.req.query("state");

      if (!code || !state) {
        return c.text("Missing code or state", 400);
      }

      const storedState = oauthStates.get(state);
      if (!storedState) {
        return c.text("Invalid or expired state", 400);
      }

      oauthStates.delete(state);

      try {
        const tokens = await google.validateAuthorizationCode(code, storedState.codeVerifier);

        // Get user info
        const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.accessToken()}` },
        });

        if (!userResponse.ok) {
          throw new Error("Failed to get user info");
        }

        const userInfo = await userResponse.json() as { email: string; name: string };

        // Check if user is allowed (single-user mode)
        if (config.allowedEmail && userInfo.email !== config.allowedEmail) {
          return c.text("Unauthorized user", 403);
        }

        // Create session
        const session = createSession(userInfo.email);

        setCookie(c, "session", session.id, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "Lax",
          maxAge: 30 * 24 * 60 * 60, // 30 days
          path: "/",
        });

        return c.redirect("/");
      } catch (error) {
        console.error("OAuth error:", error);
        return c.text("Authentication failed", 500);
      }
    },

    // Logout
    async logout(c: Context) {
      const sessionId = getCookie(c, "session");
      if (sessionId) {
        deleteSession(sessionId);
        deleteCookie(c, "session");
      }
      return c.redirect("/");
    },
  };
}

// Auth middleware
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const sessionId = getCookie(c, "session");

  if (!sessionId) {
    // For API requests, return 401
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    // For browser requests, redirect to login
    return c.redirect("/auth/login");
  }

  const session = getSession(sessionId);
  if (!session) {
    deleteCookie(c, "session");
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return c.redirect("/auth/login");
  }

  // Attach session to context
  c.set("session", session);
  c.set("userEmail", session.user_email);

  await next();
};

// Optional auth (doesn't require, but loads if present)
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const sessionId = getCookie(c, "session");

  if (sessionId) {
    const session = getSession(sessionId);
    if (session) {
      c.set("session", session);
      c.set("userEmail", session.user_email);
    }
  }

  await next();
};
