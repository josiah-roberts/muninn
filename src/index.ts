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

// Favicon
app.get("/favicon.svg", async (c) => {
  const svg = readFileSync(join(import.meta.dir, "client", "favicon.svg"), "utf-8");
  return c.body(svg, 200, { "Content-Type": "image/svg+xml" });
});

// Login page HTML
const loginHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Muninn - Login</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
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
    h1 { font-size: 2rem; }
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
    .brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .brand svg {
      width: 2.5rem;
      height: 2.5rem;
      fill: #e5e5e5;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="brand">
      <svg viewBox="0 0 360.416 360.416" xmlns="http://www.w3.org/2000/svg">
        <path d="M358.952,150.509c2.597-11.582,1.212-22.53-0.127-33.119c-1.144-9.042-2.223-17.581-0.591-25.51c3.869-18.796-8.128-39.427-19.013-55.301c-12.143-17.708-25.283-20.22-42.522-21.836c-0.932-0.087-1.884-0.132-2.829-0.132c-11.568,0-21.231,6.474-26.423,9.952c-1.347,0.902-2.739,1.835-3.147,1.917c-0.646,0.129-2.158,0.149-4.071,0.175c-5.138,0.068-13.736,0.183-23.974,2.376c-9.976,2.138-17.97,7.219-17.821,11.327c0.056,1.556,1.194,3.561,6.298,4.274c10.694,1.495,20.149,4.392,27.746,6.719c1.502,0.46,2.911,0.892,4.218,1.277c8.22,2.426,15.813,5.741,18.413,19.486c1.809,9.558-14.625,20.525-29.123,30.202c-6.014,4.013-11.693,7.804-16.268,11.521c-15.954,12.963-46.374,39.235-56.119,48.467c-9.237,8.751-86.918,62.013-107.799,72.199c-21.338,10.409-42.134,26.726-47.345,37.147c-1.168,2.336-1.418,3.816-0.812,4.797c0.265,0.428,0.812,0.938,1.915,0.938c1.313,0,3.111-0.757,4.662-1.491c0.002,0.188,0.037,0.381,0.119,0.578c0.463,1.119,1.955,1.262,3.203,1.262c3.411,0,10.521-1.401,19.192-3.771c-3.114,2.302-9.293,6.265-14.915,9.871C9.595,298.094-0.274,305.019,0.006,308.368c0.154,1.855,1.38,4.066,6.345,4.066c3.048,0,6.762-0.783,9.747-1.412c1.549-0.326,2.891-0.609,3.818-0.717c-0.338,0.709-1.205,1.928-1.82,2.794c-1.992,2.802-4.052,5.7-2.585,7.534c0.44,0.551,1.189,0.819,2.287,0.819c3.285,0,10.301-2.437,17.086-4.794c4.844-1.683,9.419-3.272,12.184-3.825c4.222-0.844,24.688-11.443,44.479-21.693c14.766-7.647,31.502-16.314,33.303-16.512c3.507,0,31.84-2.067,49.711-7.174c3.983-1.138,8.238-1.715,12.647-1.715c10.719,0,21.066,3.333,29.931,6.643c-0.055,2.158-0.109,4.802-0.165,8.048c-0.151,8.905-0.218,18.128-0.196,20.565c0.029,3.404,6.457,9.411,15.534,17.525c3.734,3.338,8.317,7.436,9.159,8.91c-1.521,0.946-3.853,0.974-6.745,1.009c-5.052,0.061-11.97,0.144-19.146,5.616c-4.179,3.187-6.942,7.744-7.569,9.963c-0.059,0.205-0.234,0.828,0.152,1.339c0.215,0.283,0.545,0.446,0.906,0.446c0.301,0,0.604-0.112,0.93-0.342l0.737-0.527c2.341-1.677,7.822-5.605,10.766-6.725c3.979-1.514,6.902-2.131,10.092-2.131c4.188,0,9.138,1.076,16.806,3.063c4.696,1.216,8.705,1.808,12.256,1.808c4.619,0,7.973-0.978,11.523-2.013c4.131-1.204,8.401-2.449,15.383-2.449c1.297,0,2.665,0.044,4.067,0.132c7.649,0.479,14.502,4.462,17.796,6.376c1.418,0.824,1.847,1.073,2.311,1.073l0.706-0.028l0.265-0.59c0.347-0.771-0.089-1.261-2.182-3.619c-3.516-3.959-6.806-6.381-9.986-7.947c1.944-0.378,3.739-0.896,5.584-1.434c4.131-1.204,8.401-2.449,15.382-2.449c1.297,0,2.665,0.044,4.067,0.132c7.649,0.479,14.503,4.462,17.796,6.375c1.419,0.825,1.848,1.073,2.312,1.073l0.706-0.028l0.265-0.59c0.347-0.771-0.089-1.261-2.182-3.619c-7.444-8.383-13.889-9.927-20.382-10.875c-2.55-0.371-4.478-1.228-4.688-2.082c-0.173-0.699,0.774-1.882,2.534-3.164c3.122-2.274,6.262-3.427,9.333-3.427c5.441,0,8.826,3.572,9.194,4.93c0.166,0.616,0.653,0.834,1.021,0.834c0.375,0,0.87-0.228,1.03-0.868c0.301-1.196-0.06-6.437-4.487-8.808c-2.211-1.185-5.633-1.837-9.636-1.837c-9.456,0-19.744,3.326-28.221,9.011c-1.689-0.342-3.622-0.526-5.722-0.526c-0.583,0-1.17,0.018-1.758,0.043c-7.241-5.788-19.983-19.26-20.717-23.842c-0.483-3.021-0.765-12.566-0.765-21.797c0-0.035,0-0.068,0-0.103c6-2.984,12.091-6.5,19.155-10.656C325.72,237.381,354.159,171.891,358.952,150.509z M250.816,278.882c-0.079,6.328-0.111,11.825-0.095,13.628c0.03,3.403,6.457,9.41,15.533,17.524c3.53,3.155,7.813,6.985,8.984,8.641c-0.794,0.338-1.582,0.693-2.362,1.069c-1.208,0.168-2.619,0.19-4.206,0.209c-3.271,0.04-7.325,0.098-11.724,1.612c-7.352-6.351-18.116-18.122-18.793-22.343c-0.366-2.289-0.5-8.327-0.576-15.135C240.497,283.086,244.846,281.491,250.816,278.882z"/>
      </svg>
      <h1>Muninn</h1>
    </div>
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
console.log(`Muninn server starting on port ${config.port}${config.tls.enabled ? " (HTTPS)" : ""}...`);

export default {
  port: config.port,
  hostname: "0.0.0.0", // Bind to all interfaces (accessible via Tailscale)
  fetch: app.fetch,
  idleTimeout: 120, // 2 minutes for long transcription requests
  ...(config.tls.enabled && {
    tls: {
      cert: Bun.file(config.tls.certPath),
      key: Bun.file(config.tls.keyPath),
    },
  }),
};
