import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import { config } from "./config.ts";
import { api } from "./server/api.ts";
import { getAuthRoutes, requireAuth, optionalAuth, cleanupSessions } from "./server/auth.ts";
import { readFileSync } from "fs";
import { join } from "path";

type Variables = {
  session: unknown;
  userEmail: string;
};

const app = new Hono<{ Variables: Variables }>();

// Middleware
app.use("*", logger());
app.use("*", secureHeaders());
app.use("/api/*", cors({
  origin: ["http://localhost:3000"],
  credentials: true,
}));

// Auth routes (no auth required)
const authRoutes = getAuthRoutes();
app.get("/auth/login", authRoutes.login);
app.get("/auth/callback", authRoutes.callback);
app.get("/auth/logout", authRoutes.logout);

// Protected API routes
app.use("/api/*", requireAuth);
app.route("/api", api);

// Static files (Preact build output)
app.use("/assets/*", serveStatic({ root: "./dist/client" }));

// Login page HTML
const loginHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Journal - Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-container {
      text-align: center;
      padding: 2rem;
    }
    h1 { margin-bottom: 1rem; font-size: 2rem; }
    p { margin-bottom: 2rem; color: #a3a3a3; }
    .login-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      color: #e5e5e5;
      text-decoration: none;
      font-size: 1rem;
      transition: all 0.2s;
    }
    .login-btn:hover {
      background: #262626;
      border-color: #444;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>Journal</h1>
    <p>Voice-first journaling with AI-powered organization</p>
    <a href="/auth/login" class="login-btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Sign in with Google
    </a>
  </div>
</body>
</html>
`;

// Load app HTML template (Preact)
function getAppHtml(userEmail: string): string {
  try {
    const htmlPath = join(import.meta.dir, "client", "index.html");
    let html = readFileSync(htmlPath, "utf-8");
    // Inject user email into the page via data attribute
    const escapedEmail = userEmail.replace(/"/g, '&quot;');
    html = html.replace("__USER_EMAIL__", escapedEmail);
    return html;
  } catch (error) {
    console.error("Failed to load index.html:", error);
    return "<html><body>Error loading application</body></html>";
  }
}

// Main route
app.get("/", optionalAuth, async (c) => {
  const userEmail = c.get("userEmail");

  if (!userEmail) {
    return c.html(loginHtml);
  }

  return c.html(getAppHtml(userEmail));
});

// Catch-all for SPA routing
app.get("/*", requireAuth, async (c) => {
  const userEmail = c.get("userEmail");
  return c.html(getAppHtml(userEmail));
});

// Session cleanup every hour
setInterval(cleanupSessions, 60 * 60 * 1000);

// Start server
const useTLS = process.env.USE_TLS === "true";
console.log(`Journal server starting on port ${config.port}${useTLS ? " (HTTPS)" : ""}...`);

export default {
  port: config.port,
  hostname: "0.0.0.0", // Bind to all interfaces (accessible via Tailscale)
  fetch: app.fetch,
  idleTimeout: 120, // 2 minutes for long transcription requests
  ...(useTLS && {
    tls: {
      cert: Bun.file("./certs/server.crt"),
      key: Bun.file("./certs/server.key"),
    },
  }),
};
