# Muninn

Voice-first personal journaling app with AI-powered organization. Record audio entries, get automatic transcription and analysis, and access your memories through an MCP server for Claude.ai integration.

## Project Goals

- **Preserve memories**: Convert fleeting thoughts and experiences into durable, searchable records
- **Low friction**: Voice recording as the primary input method
- **AI organization**: Automatic categorization, tagging, theme extraction, and cross-entry linking
- **Accessible**: MCP server for querying journal from Claude.ai; markdown files for grep/local tools
- **Reliable**: Audio safety during recording; ACID storage; no data loss

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Muninn Service                          │
├─────────────────────────────────────────────────────────────┤
│  Web UI (Preact + Signals)                                  │
│  - Audio recording with chunked safety                      │
│  - Entry browsing and playback                              │
│  - Interview question carousel                              │
│  - Settings management (profile, agent overview)            │
├─────────────────────────────────────────────────────────────┤
│  API Layer (Hono)                                           │
│  - REST endpoints for CRUD                                  │
│  - Google OAuth + session management                        │
│  - Audio streaming                                          │
│  - Rate limiting                                            │
├─────────────────────────────────────────────────────────────┤
│  Core Services                                              │
│  - STT: faster-whisper (self-hosted)                        │
│  - Analysis: Claude Agent SDK with multi-turn conversation  │
│  - Storage: SQLite + markdown sync                          │
├─────────────────────────────────────────────────────────────┤
│  MCP Server                                                 │
│  - Read-only journal access for Claude.ai                   │
│  - 6 tools + 3 resources                                    │
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
- **UI**: Preact + @preact/signals
- **Database**: SQLite (bun:sqlite)
- **Auth**: Google OAuth via Arctic
- **STT**: faster-whisper (onerahmet/openai-whisper-asr-webservice)
- **AI**: Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
- **MCP**: @modelcontextprotocol/sdk
- **Validation**: Zod

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
| `PORT` | Server port (default: 3000) |
| `DATA_DIR` | Data directory path (default: ./data) |
| `USE_TLS` | Enable TLS (default: false) |
| `TLS_CERT_PATH` | Path to TLS certificate |
| `TLS_KEY_PATH` | Path to TLS key |
| `DEBUG_AGENT_MESSAGES` | Log agent conversation to console |

## Project Structure

```
src/
├── index.ts              # Server entry point
├── config.ts             # Environment configuration
├── server/
│   ├── api.ts            # REST API routes
│   ├── auth.ts           # OAuth + session handling
│   └── rate-limit.ts     # Rate limiting middleware
├── services/
│   ├── db.ts             # SQLite schema + connection
│   ├── storage.ts        # Data access + markdown sync
│   ├── stt.ts            # Speech-to-text abstraction
│   ├── analysis.ts       # Claude analysis integration
│   └── retry.ts          # API retry logic
├── agent/
│   ├── analyzer.ts       # Multi-turn Claude agent for analysis
│   └── tools.ts          # Agent tools for journal operations
├── mcp/
│   └── server.ts         # MCP server for Claude.ai
└── client/
    ├── index.html        # HTML template
    ├── main.tsx          # Client entry point
    ├── App.tsx           # Root Preact component
    ├── api/              # API client functions
    ├── store/            # Preact signals state
    ├── hooks/            # Custom hooks
    ├── styles/           # CSS modules
    ├── types/            # TypeScript types
    └── components/
        ├── DataSafetyIndicator/
        ├── EntryCard/
        ├── EntryList/
        ├── EntryModal/
        ├── Header/
        ├── InterviewCarousel/
        ├── RecordButton/
        ├── RecordingStatus/
        ├── SettingsModal/
        ├── StatusBadge/
        ├── Tag/
        ├── Toast/
        └── TrajectoryViewer/
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
- [x] Multi-turn agent analysis with trajectory tracking
- [x] Entry linking based on content similarity
- [x] Google OAuth authentication
- [x] Preact web UI with component architecture
- [x] Interview question generation and carousel UI
- [x] MCP server with 6 tools + 3 resources
- [x] Rate limiting for API and AI endpoints
- [x] User profile and agent overview settings
- [x] Integration tests for storage layer

### Needs Work
- [ ] IndexedDB backup in frontend for true offline resilience
- [ ] Chunked upload improvements for very long recordings
- [ ] Tailscale Funnel setup for remote MCP access
- [ ] Full-text search (SQLite FTS5)
- [ ] Entry editing/correction UI
- [ ] Export functionality

## MCP Server

The MCP server provides read-only access to your journal from Claude.ai:

```bash
# Run standalone
bun src/mcp/server.ts
```

### Tools
| Tool | Description |
|------|-------------|
| `list_entries` | List recent entries with metadata |
| `get_entry` | Get full entry by ID |
| `search_entries` | Keyword search across transcripts |
| `get_entries_by_tag` | Filter by tag |
| `get_timeline` | Get entries by date range |
| `analyze_themes` | Analyze recurring themes across entries |

### Resources
| Resource | URI |
|----------|-----|
| `entries` | `journal://entries` |
| `entry` | `journal://entries/{id}` |
| `tags` | `journal://tags` |

## API Endpoints

### Entries
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/entries` | Create entry (multipart audio upload) |
| GET | `/api/entries` | List entries |
| GET | `/api/entries/:id` | Get entry details |
| PATCH | `/api/entries/:id` | Update entry |
| DELETE | `/api/entries/:id` | Delete entry |
| GET | `/api/entries/:id/audio` | Stream audio |
| POST | `/api/entries/:id/audio-chunk` | Upload audio chunk |
| POST | `/api/entries/:id/transcribe` | Trigger transcription |
| POST | `/api/entries/:id/retranscribe` | Re-transcribe from audio |
| POST | `/api/entries/:id/analyze` | Trigger Claude analysis |

### Tags
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tags` | List all tags |
| POST | `/api/entries/:id/tags` | Add tag to entry |
| DELETE | `/api/entries/:id/tags/:tag` | Remove tag from entry |

### Search & Discovery
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search?q=` | Search entries |
| GET | `/api/interview-questions` | Get suggested prompts |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings/agent-overview` | Get agent overview |
| PUT | `/api/settings/agent-overview` | Update agent overview |
| GET | `/api/settings/user-profile` | Get user profile |
| PUT | `/api/settings/user-profile` | Update user profile |

## License

MIT
