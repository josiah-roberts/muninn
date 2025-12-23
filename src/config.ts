import { join } from "path";

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  dataDir: process.env.DATA_DIR || "./data",

  get dbPath() {
    return join(this.dataDir, "journal.db");
  },
  get audioDir() {
    return join(this.dataDir, "audio");
  },
  get entriesDir() {
    return join(this.dataDir, "entries");
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/callback",
  },

  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",

  whisperUrl: process.env.WHISPER_URL || "http://localhost:9000",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",

  // Allowed Google account email (single user mode)
  allowedEmail: process.env.ALLOWED_EMAIL || "",
} as const;
