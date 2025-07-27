# Muninn

A minimal, self-hosted AI-powered personal knowledge management system with semantic search capabilities.

## About Muninn

Muninn is a personal knowledge management system designed for journaling and notes with powerful AI integration. Named after one of Odin's ravens, it helps you remember and search through your knowledge.

### Key Features

- **Semantic Search**: AI-powered search using embeddings to find relevant content by meaning, not just keywords
- **Self-Hosted**: Complete control over your data with Docker-based deployment
- **AI Integration**: Claude MCP connector for intelligent document editing and organization
- **Simple Interface**: Minimal design focused on writing and searching
- **Data Portability**: Export to markdown files for use with other tools

## Architecture

### Core Components

- **Frontend**: React with TypeScript for the web interface
- **Backend**: Node.js server with MCP (Model Context Protocol) integration
- **Database**: PostgreSQL with pgvector for semantic search
- **AI**: Gemini Embeddings for vectorization and Claude for intelligent editing
- **Deployment**: Docker containers on Unraid with Tailscale Funnel for remote access

### Technology Stack

- **Database**: PostgreSQL with pgvector extension for vector similarity search
- **Embeddings**: Google Gemini Embeddings 001 for document vectorization
- **Search**: HNSW indexing for fast semantic similarity queries
- **Authentication**: Google OAuth for secure access
- **Transport**: MCP over SSE (Server-Sent Events) for Claude integration
- **Development**: Turborepo monorepo with TypeScript throughout

### Development Tools

This project includes:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting
- [Turborepo](https://turborepo.com/) for efficient monorepo management
- [Docker](https://docker.com/) for containerized deployment

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Docker and Docker Compose
- PostgreSQL with pgvector extension

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd muninn
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

### Build

To build all packages:

```bash
# Build everything
npm run build

# Build specific package
npm run build --filter=web
```

### Development

To start development servers:

```bash
# Start all development servers
npm run dev

# Start specific service
npm run dev --filter=web
npm run dev --filter=server
```

### Docker Deployment

**Development:**
```bash
# Start development environment with compose
docker-compose up --build
```

**Production:**
```bash
# Production uses single container with external environment variables
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="..." \
  -e GOOGLE_OAUTH_CLIENT_ID="..." \
  -e GOOGLE_OAUTH_CLIENT_SECRET="..." \
  muninn:latest
```

Production deployment is designed for platforms like Unraid where environment variables are managed externally.

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo login

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo login
yarn exec turbo login
pnpm exec turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo link

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo link
yarn exec turbo link
pnpm exec turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.com/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.com/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.com/docs/reference/configuration)
- [CLI Usage](https://turborepo.com/docs/reference/command-line-reference)
