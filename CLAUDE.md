# Muninn

Voice-first journaling app with AI-powered organization.

## Architecture

- **Runtime**: Bun
- **Framework**: Hono (web server)
- **Database**: SQLite with WAL mode (via bun:sqlite)
- **Auth**: Google OAuth (via Arctic library)
- **STT**: Faster-Whisper (self-hosted at localhost:9000)
- **AI Analysis**: Claude Opus 4.5 via Anthropic API
- **MCP Server**: Read-only access for Claude.ai integration

## Key Files

- `src/index.ts` - Main server entry point, serves web UI
- `src/server/api.ts` - REST API endpoints
- `src/server/auth.ts` - Google OAuth + session management
- `src/services/db.ts` - SQLite schema and connection
- `src/services/storage.ts` - Data access layer + markdown sync
- `src/services/stt.ts` - Speech-to-text abstraction
- `src/services/analysis.ts` - Claude API integration for analysis
- `src/mcp/server.ts` - MCP server for Claude.ai access

## Data Flow

1. User records audio in browser
2. Audio uploaded to `/api/entries` (creates entry with audio file)
3. Transcription triggered via `/api/entries/:id/transcribe`
4. Analysis triggered via `/api/entries/:id/analyze`
5. Entry synced to markdown file in `data/entries/`

## Running

```bash
# Development (with hot reload)
docker compose up

# Or locally
bun run dev

# Run tests
bun test
```

## Environment Variables

See `.env.example` for required configuration:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth
- `SESSION_SECRET` - Session encryption
- `ANTHROPIC_API_KEY` - Claude API
- `WHISPER_URL` - STT endpoint
- `ALLOWED_EMAIL` - Single-user mode (optional)

## MCP Server

The MCP server provides read-only access to journal data:

```bash
# Run standalone
bun src/mcp/server.ts
```

Tools available:
- `list_entries` - List recent entries
- `get_entry` - Get specific entry
- `search_entries` - Search by keyword
- `get_entries_by_tag` - Filter by tag
- `get_timeline` - Get entries by date range
- `analyze_themes` - Analyze recurring themes
