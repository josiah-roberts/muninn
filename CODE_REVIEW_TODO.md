# Code Review TODO

Generated from parallel code review on 2024-12-22. Issues prioritized by severity and grouped by area.

## Critical (Must Fix Before Use)

### Security

- [x] **SQL injection in updateEntry()** - Column names not whitelisted
  - File: `src/services/storage.ts:65-77`
  - Fix: Add `ALLOWED_FIELDS` whitelist, reject unknown keys
  - ✓ Fixed: Added Zod schema validation at API layer with `.strict()` to reject unknown fields

- [x] **Path traversal in chunked audio upload** - Entry ID not validated
  - File: `src/server/api.ts:134`
  - Fix: Validate IDs are alphanumeric + hyphens only
  - ✓ Fixed: Added `isValidEntryId()` validation before file path construction

- [ ] **XSS vulnerabilities** - innerHTML with unsanitized content
  - File: `src/web/assets/app.js:209-311`
  - Fix: **Migrate to Preact + TypeScript** (JSX auto-escapes), or add sanitizeHTML()

- [x] **SESSION_SECRET not used** - Sessions not signed/verified
  - File: `src/server/auth.ts`
  - Fix: HMAC sign session IDs, verify on retrieval
  - ✓ Fixed: Added HMAC-SHA256 signing with timing-safe verification, production warning for default secret

- [x] **No CSRF protection** - State-changing routes vulnerable
  - Files: All API routes
  - Fix: Add CSRF tokens or use `sameSite: Strict` cookies
  - ✓ Fixed: Changed session cookie to sameSite: Strict

### Data Loss Prevention

- [ ] **Audio upload failure loses data** - No retry, no persistence
  - File: `src/web/assets/app.js:93-151`
  - Fix: Store blob before upload, implement retry with exponential backoff, add IndexedDB fallback

- [x] **No timeouts on external APIs** - Can hang indefinitely
  - Files: `src/services/stt.ts:33`, `src/services/analysis.ts:36,117,186`
  - Fix: Add AbortSignal with 60s timeout for STT, 120s for Claude
  - ✓ Fixed: Added 60s timeout for STT via fetchWithTimeout, 120s for Claude via SDK timeout option

- [x] **No transactions for multi-step operations**
  - Files: `src/services/storage.ts:85-103` (deleteEntry), `src/server/api.ts:204-213` (analysis)
  - Fix: Wrap in `db.transaction()`, delete files AFTER DB success
  - ✓ Fixed: Added `withTransaction()` helper, deleteEntry deletes DB first then files, analyze endpoint wraps all DB ops in transaction

## High Priority

### Security

- [ ] **Unrestricted file upload size** - DoS risk
  - File: `src/server/api.ts:66-105`
  - Fix: Add 50MB limit, reject larger files

- [x] **No input validation on PATCH** - Accepts arbitrary JSON
  - File: `src/server/api.ts:238-248`
  - Fix: Validate request body with Zod schema
  - ✓ Fixed: Added `UpdateEntrySchema` Zod validation with `.strict()`

- [ ] **No rate limiting** - API abuse risk, costly Claude calls
  - Files: All API routes, especially `/transcribe` and `/analyze`
  - Fix: Add rate limiting middleware (e.g., hono-rate-limiter)

- [ ] **OAuth state in memory** - Lost on restart
  - File: `src/server/auth.ts:69-79`
  - Fix: Store in SQLite with short TTL

- [ ] **Hardcoded OAuth redirect URI**
  - File: `src/server/auth.ts:14-18`
  - Fix: Move to environment variable

### Reliability

- [ ] **iOS Safari MIME type incompatibility**
  - File: `src/web/assets/app.js:49-53`
  - Fix: Add `audio/mp4` fallback, check MediaRecorder support at startup

- [x] **No retry logic for external APIs**
  - Files: `src/services/stt.ts`, `src/services/analysis.ts`
  - Fix: Add exponential backoff retry (3 attempts)
  - ✓ Fixed: Created withRetry utility with exponential backoff, applied to all external API calls

- [ ] **Race condition in markdown sync**
  - File: `src/services/storage.ts:79-81`
  - Fix: Add "dirty" flag, sync recovery on startup

- [ ] **Chunked upload race condition**
  - File: `src/server/api.ts:108-147`
  - Fix: Store chunks separately, concatenate on completion, add cleanup job

### MCP Server

- [ ] **No read-only enforcement at module level**
  - File: `src/mcp/server.ts`
  - Fix: Create read-only storage facade that only exports safe functions

- [ ] **Missing resource list handler**
  - File: `src/mcp/server.ts`
  - Fix: Add `server.listResources()` for MCP protocol compliance

## Medium Priority

### Security

- [ ] **LIKE wildcards not escaped in search**
  - File: `src/services/storage.ts:225-234`
  - Fix: Escape `%` and `_` in user input

- [ ] **Error messages expose internals**
  - Files: `src/server/api.ts:183,233`
  - Fix: Log full errors server-side, return generic messages to client

- [ ] **Missing MIME validation on upload**
  - File: `src/server/api.ts:81-85`
  - Fix: Validate actual file content or whitelist MIME types

- [x] **Insecure dev cookies**
  - File: `src/server/auth.ts:136-137`
  - Fix: Use `sameSite: Strict`, fail if SESSION_SECRET not set in prod
  - ✓ Fixed: sameSite: Strict, critical warning logged if default secret used in production

### Code Quality

- [x] **File operation errors not handled**
  - File: `src/services/storage.ts:208,215`
  - Fix: Wrap in try-catch, log errors, queue for retry
  - ✓ Fixed: Added try-catch to syncEntryToMarkdown (logs error, doesn't throw) and saveAudioFile (rethrows with context)

- [ ] **Silent JSON parse failures**
  - File: `src/services/analysis.ts:104-107,176-177`
  - Fix: Log parse errors, return error indicator

- [x] **Missing index on entry_tags.tag_id**
  - File: `src/services/db.ts:38-41`
  - Fix: Add `CREATE INDEX idx_entry_tags_tag_id ON entry_tags(tag_id)`
  - ✓ Fixed: Added index in schema initialization

- [ ] **YAML special characters not escaped in markdown**
  - File: `src/services/storage.ts:190-206`
  - Fix: Properly quote/escape YAML values

### Frontend

- [ ] **Migrate to Preact + TypeScript**
  - Files: `src/web/assets/app.js`, `src/web/app.html`
  - Benefits: Type safety, JSX auto-escaping (fixes XSS), better maintainability
  - Add: Vite for bundling with HMR

- [ ] **Memory leak from audio chunks**
  - File: `src/web/assets/app.js:56-68`
  - Fix: Clear `audioChunks = []` after blob creation

- [ ] **No loading states on buttons**
  - File: `src/web/assets/app.js:323-345`
  - Fix: Disable buttons, show spinner during async ops

- [ ] **Mic permission error handling incomplete**
  - File: `src/web/assets/app.js:77-80`
  - Fix: Detect error type (NotAllowedError vs NotFoundError), show recovery instructions

## Low Priority

### Accessibility

- [ ] **Missing ARIA labels**
  - File: `src/web/app.html:272-282,304`
  - Fix: Add aria-label to record button, modal close

- [ ] **Modal doesn't trap focus**
  - File: `src/web/app.html:300-308`
  - Fix: Implement focus trap, add aria-modal="true"

- [ ] **user-scalable=no violates WCAG**
  - File: `src/web/app.html:5`
  - Fix: Remove, use CSS touch-action instead

### Polish

- [ ] **No audio level visualization**
  - File: `src/web/assets/app.js`
  - Fix: Add Web Audio API visualizer for recording feedback

- [ ] **No offline detection**
  - Fix: Listen to online/offline events, queue uploads

- [ ] **Timer doesn't update immediately**
  - File: `src/web/assets/app.js:168-174`
  - Fix: Call update once before starting interval

- [ ] **Hardcoded en-US locale**
  - File: `src/web/assets/app.js:210-213`
  - Fix: Use `navigator.language`

## Test Coverage Gaps

- [ ] Tests for `updateEntry()` with invalid keys (SQL injection)
- [ ] Tests for `deleteEntry()` file cleanup
- [ ] Tests for concurrent operations
- [ ] Tests for markdown/DB sync consistency
- [ ] Tests for chunked upload edge cases
- [ ] Tests for error recovery paths

## Architecture Improvements (Future)

- [ ] SQLite FTS5 for full-text search
- [ ] Background job queue for transcription/analysis
- [ ] WebSocket/SSE for real-time status updates
- [ ] Progressive audio upload (upload chunks as they arrive)
- [ ] Proper structured logging
