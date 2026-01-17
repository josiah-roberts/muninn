# Whisper Transcription App

A simple, standalone web application for transcribing audio files using OpenAI Whisper. Built with Bun and Hono, featuring a modern drag-and-drop interface.

## Features

- 🎤 Upload any audio file (MP3, WAV, M4A, FLAC, OGG, WebM)
- 🖱️ Drag-and-drop or click to upload
- ⚡ Fast transcription using Faster-Whisper
- 📋 One-click copy to clipboard
- 🎯 Automatic pause detection (shows gaps in transcription)
- 🌐 Clean, responsive web interface
- 🐳 Docker-ready with included Whisper service

## Quick Start

### Using Docker Compose (Recommended)

The easiest way to run the app with all dependencies:

```bash
# Start both the app and Whisper service
docker compose up

# Access the app at http://localhost:3001
```

The docker-compose setup includes:
- Transcription web app (port 3001)
- Whisper ASR service (port 9000)

### Running Locally

If you have Bun installed and a Whisper service running elsewhere:

```bash
# Install dependencies
bun install

# Copy and configure environment
cp .env.example .env
# Edit .env to set WHISPER_URL if needed

# Development (with hot reload)
bun run dev

# Production
bun start
```

## Configuration

Environment variables (see `.env.example`):

- `PORT` - Server port (default: 3001)
- `WHISPER_URL` - Whisper service endpoint (default: http://localhost:9000)

## Whisper Service

The app requires a Whisper ASR webservice. The included `docker-compose.yml` runs it automatically using the `base` model.

### Whisper Model Options

Edit `docker-compose.yml` to change the Whisper model:

```yaml
environment:
  - ASR_MODEL=base  # Options: tiny, base, small, medium, large-v2, large-v3
```

Model size vs. accuracy trade-offs:
- **tiny**: Fastest, least accurate (~75MB)
- **base**: Good balance (~150MB) - **Default**
- **small**: Better accuracy (~500MB)
- **medium**: High accuracy (~1.5GB)
- **large-v3**: Best accuracy (~3GB)

### GPU Acceleration

For faster transcription with NVIDIA GPU, uncomment the GPU section in `docker-compose.yml`:

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html).

### Using External Whisper Service

If you already have a Whisper service running:

1. Set `WHISPER_URL` in `.env` to your service URL
2. Run only the app: `docker compose up app` (or use `bun run dev`)

## API Endpoints

### POST /api/transcribe

Upload an audio file for transcription.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `audio` field with audio file

**Response:**
```json
{
  "text": "Transcribed text here",
  "language": "en",
  "duration": 42.5,
  "fileName": "recording.mp3"
}
```

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "whisperUrl": "http://whisper:9000"
}
```

## Architecture

- **Runtime**: Bun
- **Framework**: Hono (minimal web framework)
- **STT**: Faster-Whisper via [openai-whisper-asr-webservice](https://github.com/ahmetoner/whisper-asr-webservice)
- **Frontend**: Vanilla HTML/CSS/JavaScript

## File Structure

```
whisper-transcribe/
├── src/
│   ├── index.ts           # Main server
│   ├── whisper.ts         # Whisper API integration
│   └── public/
│       └── index.html     # Frontend UI
├── Dockerfile             # Container build
├── docker-compose.yml     # Full stack deployment
├── package.json           # Dependencies
└── README.md             # This file
```

## Troubleshooting

### Transcription fails with timeout

Longer audio files may exceed the timeout. The app uses a 3-minute timeout by default. For very long files, consider:
- Using a faster Whisper model (tiny/base)
- Enabling GPU acceleration
- Splitting audio into smaller chunks

### Whisper service won't start

Check if port 9000 is already in use:
```bash
lsof -i :9000
```

### Can't access the app

Ensure port 3001 is not blocked by firewall and the container is running:
```bash
docker compose ps
```

## Related

This is a sibling project to [Muninn](https://github.com/josiah-roberts/muninn), a voice-first journaling app. This transcription app provides a simpler, focused interface for one-off audio transcription needs.

## License

MIT
