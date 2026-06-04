# Engineer Guide - Bar Trivia

Live trivia for bars. A host runs a game from their phone, players answer on theirs, and a TV shows shared game state. This guide covers local development, testing, and deployment.

## Prerequisites

- Docker Desktop (includes Compose v2) - required for the canonical local stack
- Node.js 22 and npm 10+ - only needed for the outside-Docker workflow and CI
  - Use `.nvmrc`: `nvm use` from the repo root
- `openssl` - for generating secrets

## Repo layout

```
bar-trivia/
├── docs/                 # ADRs, requirements, engineer guide
├── packages/
│   ├── server/           # NestJS API + Socket.IO gateway + Prisma
│   ├── tv/               # React web (bar TV display)
│   ├── player/           # React web (PWA, mobile)
│   ├── host/             # React web (PWA, mobile)
│   └── shared/           # Zod schemas, socket events, constants
├── docker-compose.yml        # canonical local stack
├── docker-compose.dev.yml    # dev override: bind-mount repo, no nginx
├── Dockerfile.render     # Render deployment
├── Dockerfile.railway    # Railway deployment
├── render.yaml           # Render service config
└── railway.toml          # Railway service config
```

All packages are npm workspaces. Root-level `npm install` links all packages.

## Local development

### 1. Clone and configure environment

```bash
git clone <repo-url>
cd bar-trivia
cp .env.example .env
```

Edit `.env` and generate real secrets for `JWT_SECRET` and `COOKIE_SECRET`:

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "COOKIE_SECRET=$(openssl rand -hex 32)"
```

`.env` is gitignored and serves both Docker Compose interpolation and the server process. The server refuses to start if required vars are missing or malformed (`packages/server/src/config/env.schema.ts`).

### 2. Start the full stack

```bash
docker compose up --build
```

This starts Postgres, runs `prisma db push && prisma db seed`, then serves:
- API: `http://localhost:3000`
- TV: `http://localhost/tv` (bare `/` redirects here)
- Host: `http://localhost/host`
- Player: `http://localhost/player`

Wait for `Server running on http://localhost:3000` before testing.

### 3. Bind-mount dev stack (recommended for active development)

Run Postgres and the server in Docker, with your local repo bind-mounted into the server container. Code changes are visible without rebuilding the image. Vite clients run on the host with HMR.

```bash
docker compose -f docker-compose.dev.yml up
```

This starts Postgres and the server (port 3000). The server image is built once on first run; subsequent starts skip the build. After a code change, restart just the server:

```bash
docker compose -f docker-compose.dev.yml restart server
```

Then start whichever clients you are working on:

```bash
npm run dev:tv      # http://localhost:5173
npm run dev:player  # http://localhost:5174
npm run dev:host    # http://localhost:5175
```

`DATABASE_URL` in `.env` must use `postgres` as the host (the Docker service name) - the default in `.env.example` is already correct. The `node_modules` inside the container are isolated from your Mac-compiled binaries, so native deps (argon2, Prisma) work correctly.

To stop and preserve the database:

```bash
docker compose -f docker-compose.dev.yml down
```

To wipe the database and start fresh:

```bash
docker compose -f docker-compose.dev.yml down -v
```

### 4. Outside-Docker workflow (everything on the host)

For faster iteration on server code, run Postgres in Docker and the server on the host:

```bash
docker compose up -d postgres

# Change DATABASE_URL in .env to use localhost:
#   DATABASE_URL=postgresql://bartrivia:bartrivia@localhost:5432/bartrivia

npm install
npm run db:migrate        # prisma migrate deploy
npm run dev:server        # watches and reloads on changes
```

Individual client dev servers:

```bash
npm run dev:tv
npm run dev:player
npm run dev:host
```

### 5. Single-laptop testing tip

All three clients at the same `localhost` origin share cookies and localStorage. To isolate sessions per client, add to `/etc/hosts`:

```
127.0.0.1 host.localhost player.localhost tv.localhost
```

Then open `http://host.localhost/host`, `http://player.localhost/player`, `http://tv.localhost/tv`.

## Database

Prisma manages the schema. Two schema files exist:

- `packages/server/prisma/schema.prisma` - Postgres (default, used by Docker and Railway)
- `packages/server/prisma/schema.sqlite.prisma` - SQLite (Render free-tier only)

When you change the data model, update both schemas and the seed together.

```bash
npm run db:migrate           # prisma migrate deploy (applies pending migrations)
npm run db:migrate:dev       # prisma migrate dev (generates a new migration file)
npm run seed                 # prisma db seed (idempotent - safe to re-run)
```

The seed loads five house question packs from `packages/server/prisma/seed-content/shared-packs.json` (Open Trivia Database, CC BY-SA 4.0).

## Testing

```bash
npm test               # run Vitest suite (unit tests, no DB required)
npm run test:watch     # watch mode
npm run test:coverage
npm run typecheck      # TypeScript type check across all packages
```

The unit suite is fast and fully mocked (Prisma, argon2, clock). It covers shared Zod schemas, server services/guards, and the room-state machine.

For the full request + WebSocket journey, run the e2e scripts against a running server:

```bash
# Start the server first, then:
cd packages/server
SERVER_URL=http://localhost:3000 node test/golden-path.mjs
SERVER_URL=http://localhost:3000 node test/family-scenario.mjs
```

Run both `npm test` and `npm run typecheck` before submitting a PR.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string (`localhost:5432` outside Docker, `postgres:5432` inside) |
| `POSTGRES_USER` | Yes (Docker) | Postgres username (used by Docker Compose) |
| `POSTGRES_PASSWORD` | Yes (Docker) | Postgres password |
| `POSTGRES_DB` | Yes (Docker) | Database name |
| `JWT_SECRET` | Yes | 32+ byte random string. Generate: `openssl rand -hex 32` |
| `COOKIE_SECRET` | Yes | 32+ byte random string. Generate: `openssl rand -hex 32` |
| `NODE_ENV` | No | `development` locally, `production` on deployments |
| `STRIPE_SECRET_KEY` | No | Stripe secret key. Trial works without it; checkout/portal return 503 |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |
| `STRIPE_MONTHLY_PRICE_ID` | No | Stripe price ID for monthly host subscription |
| `STRIPE_TRIAL_DAYS` | No | Trial length in days (default: 14) |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origin allowlist (needed for cross-origin frontend hosting) |

## Deployment

### Render (free tier, SQLite, zero credentials)

One-click deploy via the button in README. Uses SQLite - no external DB or secrets needed. Good for demos.

```bash
# Manual: connect repo to Render, render.yaml is auto-detected
# JWT_SECRET and COOKIE_SECRET are auto-generated
```

Data lives on Render's ephemeral disk - wiped on redeploy. For persistence, point `DATABASE_URL` to a Neon Postgres instance and switch `render.yaml` to use `schema.prisma`.

Free-tier services sleep after 15 min of inactivity; cold start takes ~30 s.

### Railway (Postgres, persistent)

Postgres is a Railway plugin - data persists across deploys. Suitable for a real pilot.

```bash
npm install -g @railway/cli
railway login
railway init            # or link an existing project

# Add PostgreSQL plugin in Railway dashboard (sets DATABASE_URL automatically)

# Set required vars in Railway dashboard:
#   JWT_SECRET, COOKIE_SECRET, NODE_ENV=production

railway up              # deploy from repo root
```

Optional Stripe billing vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MONTHLY_PRICE_ID`.

First deploy takes 5-8 min (builds three SPAs, runs migrations, seeds question packs).

Reachable at your Railway public domain:
- TV: `https://<app>.railway.app/tv`
- Host: `https://<app>.railway.app/host`
- Player: `https://<app>.railway.app/player`

### Cloudflare Pages (optional, for CDN-served frontends)

Serve the React SPAs from Cloudflare Pages with the API on Railway.

1. Set `ALLOWED_ORIGINS` in Railway vars to your Cloudflare Pages URL(s).
2. Create three Cloudflare Pages projects (one per client):

| Setting | Value |
|---|---|
| Build command | `npm run build --workspace=packages/<client>` |
| Build output | `packages/<client>/dist` |
| `VITE_API_URL` | Your Railway API URL |
| Node.js version | `22` |

Note: cross-origin cookie support requires switching `sameSite` from `lax` to `none` on the server.

## Architecture notes

- **Server-authoritative game state.** Clients render off WebSocket broadcasts. `RoomState` lives in process memory (`RoomStateStore`), not the database. Postgres persists durable records (users, packs, rooms, results).
- **REST for actions, WebSockets for state.** Clients POST actions over REST; server pushes state transitions via Socket.IO to every room participant.
- **Three guards run on every request** (in order): `JwtAuthGuard`, `RolesGuard`, `SubscriptionActiveGuard`. Default is locked-down; use `@Public()`, `@Roles()`, and `@RequiresSubscription()` decorators to opt in.
- **Monorepo + npm workspaces.** New packages go in `packages/<name>`. Shared types/schemas belong in `packages/shared`, imported as `@bar-trivia/shared`.

## ADRs

- [ADR 0001 - Server stack](0001-server-stack.md) - NestJS on Express v5, Socket.IO
- [ADR 0002 - Database](0002-database.md) - Postgres + Prisma, jsonb for document-shaped data
- [ADR 0004 - Auth](0004-auth.md) - Hybrid JWT + Postgres refresh tokens, argon2id
