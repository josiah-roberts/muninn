const STATIC_PATH = Deno.env.get("STATIC_PATH");
const SERVE_STATIC = STATIC_PATH !== undefined;
const DEBUG = Deno.env.get("DEBUG") === "true";
const PORT = parseInt(Deno.env.get("PORT") ?? "8000");

if (DEBUG) {
  console.log(`Starting server on port ${PORT}`);
  console.log(`Serve static files: ${SERVE_STATIC}`);
}

const _server = Deno.serve({ port: PORT }, (req: Request) => {
  const url = new URL(req.url);

  if (DEBUG) {
    console.log(`${req.method} ${url.pathname}`);
  }

  if (url.pathname.startsWith("/api")) {
    return new Response(JSON.stringify({ message: "Hello from API!" }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (SERVE_STATIC) {
    // TODO: Harden this, use a proper static file server, yield, etc.
    const filePath = STATIC_PATH + url.pathname;
    return new Response(Deno.readTextFileSync(filePath), {
      headers: { "content-type": "text/html" },
    });
  }

  return new Response("Backend running - API available at /api", {
    headers: { "content-type": "text/plain" },
  });
});

console.log(`Server running on http://localhost:${PORT}`);
