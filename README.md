# Journal

Voice-first personal journaling app with AI-powered organization. Record audio entries, get automatic transcription and analysis, and access your memories through a MCP server for Claude.ai integration.

## Project Goals

- **Preserve memories**: Convert fleeting thoughts and experiences into durable, searchable records
- **Low friction**: Voice recording as the primary input method
- **AI organization**: Automatic categorization, tagging, theme extraction, and cross-entry linking
- **Accessible**: MCP server for querying journal from Claude.ai; markdown files for grep/local tools
- **Reliable**: Audio safety during recording; ACID storage; no data loss

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Journal Service                          │
├─────────────────────────────────────────────────────────────┤
│  Web UI (Vanilla JS)                                        │
│  - Audio recording with chunked safety                      │
│  - Entry browsing and playback                              │
│  - Visual feedback for recording state                      │
├─────────────────────────────────────────────────────────────┤
│  API Layer (Hono)                                           │
│  - REST endpoints for CRUD                                  │
│  - Google OAuth + session management                        │
│  - Audio streaming                                          │
├─────────────────────────────────────────────────────────────┤
│  Core Services                                              │
│  - STT: faster-whisper (self-hosted)                        │
│  - Analysis: Claude Opus 4.5 via Anthropic API              │
│  - Storage: SQLite + markdown sync                          │
├─────────────────────────────────────────────────────────────┤
│  MCP Server                                                 │
│  - Read-only journal access for Claude.ai                   │
│  - Tools: list, search, filter by tag/date, analyze themes  │
├─────────────────────────────────────────────────────────────┤
│  Storage                                                    │
│  - SQLite with WAL mode (data/journal.db)                   │
│  - Audio files (data/audio/)                                │
│  - Markdown mirror (data/entries/)                          │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Database**: SQLite (bun:sqlite)
- **Auth**: Google OAuth via Arctic
- **STT**: faster-whisper (onerahmet/openai-whisper-asr-webservice)
- **AI**: Claude Opus 4.5 (Anthropic API)
- **MCP**: @modelcontextprotocol/sdk

## Quick Start

```bash
# Install dependencies
bun install

# Copy environment template
cp .env.example .env
# Edit .env with your credentials

# Development (with hot reload)
bun run dev

# Or via Docker
docker compose up

# Run tests
bun test
```

## Configuration

Required environment variables (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `SESSION_SECRET` | Random string for session encryption |
| `ANTHROPIC_API_KEY` | API key for Claude |
| `WHISPER_URL` | URL to faster-whisper service |
| `ALLOWED_EMAIL` | (Optional) Restrict to single user |

## Project Structure

```
src/
├── index.ts              # Server entry point
├── config.ts             # Environment configuration
├── server/
│   ├── api.ts            # REST API routes
│   └── auth.ts           # OAuth + session handling
├── services/
│   ├── db.ts             # SQLite schema
│   ├── storage.ts        # Data access + markdown sync
│   ├── stt.ts            # Speech-to-text abstraction
│   └── analysis.ts       # Claude API integration
├── mcp/
│   └── server.ts         # MCP server for Claude.ai
└── web/
    ├── app.html          # Main application UI
    └── assets/app.js     # Frontend JavaScript
```

## Current Status

### Implemented
- [x] Project scaffolding with Bun + TypeScript
- [x] Docker setup with hot reload
- [x] SQLite storage with WAL mode
- [x] Audio file management
- [x] Markdown sync for grep-ability
- [x] STT integration (faster-whisper)
- [x] Claude analysis (title, themes, tags, insights, follow-ups)
- [x] Entry linking based on content similarity
- [x] Google OAuth authentication
- [x] Web UI with audio recording
- [x] MCP server with 6 tools
- [x] Integration tests for storage layer

### Needs Work
- [ ] IndexedDB backup in frontend for true offline resilience
- [ ] Chunked upload improvements for very long recordings
- [ ] Tailscale Funnel setup for remote MCP access
- [ ] Interview/dialog mode with Claude follow-up questions
- [ ] Full-text search (SQLite FTS5)
- [ ] Entry editing/correction UI
- [ ] Export functionality

## MCP Server

The MCP server provides read-only access to your journal from Claude.ai:

```bash
# Run standalone
bun src/mcp/server.ts
```

Available tools:
- `list_entries` - List recent entries with metadata
- `get_entry` - Get full entry by ID
- `search_entries` - Keyword search across transcripts
- `get_entries_by_tag` - Filter by tag
- `get_timeline` - Get entries by date range
- `analyze_themes` - Analyze recurring themes across entries

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/entries` | Create entry (multipart audio upload) |
| GET | `/api/entries` | List entries |
| GET | `/api/entries/:id` | Get entry details |
| PATCH | `/api/entries/:id` | Update entry |
| DELETE | `/api/entries/:id` | Delete entry |
| GET | `/api/entries/:id/audio` | Stream audio |
| POST | `/api/entries/:id/transcribe` | Trigger transcription |
| POST | `/api/entries/:id/analyze` | Trigger Claude analysis |
| GET | `/api/tags` | List all tags |
| GET | `/api/search?q=` | Search entries |
| GET | `/api/interview-questions` | Get suggested prompts |

## License

Private / Personal Use
