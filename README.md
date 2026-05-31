# Bar Trivia

Live trivia game built for bars. A host runs the game from a phone, players answer on their phones, and a TV displays the shared game state (current question, scoreboard, timer). The platform aims to make joining frictionless for casual players while rewarding registered players with persistent stats and in-game lifelines.

> **Status:** v0 vertical slice implemented and runnable end-to-end — a NestJS + Socket.IO server, Postgres/Prisma persistence, and three React clients (TV, player, host). See [Running locally](#running-locally) to bring up the full stack on your machine. [CLAUDE.md](CLAUDE.md) holds the load-bearing decisions and [docs/requirements.md](docs/requirements.md) is the product/behavioral spec.

## Running locally

The canonical local stack is `docker compose up`: Postgres, the server, and an nginx that serves all three clients on a single port. Bare-IP visits redirect to the TV; the host and player live at `/host` and `/player` respectively.

**Prerequisites:** Docker (and Docker Compose v2). Node 22 (see [`.nvmrc`](.nvmrc)) and npm 10+ are only required for the optional outside-Docker workflow at the end of this section.

### 1. Create your `.env`

The single `.env` at the repo root drives both Docker Compose interpolation and the server's process environment. Copy the template and fill in real secrets:

```bash
cp .env.example .env
```

Generate proper secrets for `JWT_SECRET` and `COOKIE_SECRET` (32+ bytes each):

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "COOKIE_SECRET=$(openssl rand -hex 32)"
```

`.env` is gitignored. Same filename for dev and prod — only the contents differ. The server validates the variables at startup and refuses to boot on missing or malformed values (see `packages/server/src/config/env.schema.ts`).

### 2. (Optional) Per-client hostnames for single-laptop testing

When `/host`, `/player`, and `/tv` all live at the same origin (`http://localhost`) in one browser, they share cookies and localStorage. That's harmless in a real venue (three separate devices) but confusing on a single laptop — a guest session minted by `/player` can shadow a host session on `/host`.

To give each client its own cookie jar in dev, add to `/etc/hosts`:

```
127.0.0.1 host.localhost player.localhost tv.localhost
```

Then open the clients at `http://host.localhost/host`, `http://player.localhost/player`, and `http://tv.localhost/tv`. Browsers treat the three hostnames as separate origins, so no cross-client leakage. The server's CORS allowlist already accepts `*.localhost`.

### 3. Bring up the stack

```bash
docker compose up --build
```

This starts Postgres, runs `prisma db push && prisma db seed` in the server container, then serves the API on `:3000` and nginx on `:80`. Wait for the line `Server running on http://localhost:3000`, then visit:

- TV: <http://localhost/tv> (or just <http://localhost> — bare URL redirects to `/tv`)
- Host: <http://localhost/host>
- Player: <http://localhost/player>

### 4. Play a game

1. **Host** — open `/host`, **Register** to create a host account, build a pack + game with a few questions, then create a room. You'll get a 4-character room code.
2. **TV** — open `/tv` and enter the room code, or open `/tv/CODE` directly.
3. **Players** — scan the TV's QR code or open `/player` and join with the room code. No account required.
4. Drive the game from the host; TV and players update live over WebSockets.

The seeded "Trivia Host" account has no password (it only exists to own the demo pack), so register your own host account to sign in.

### Outside-Docker workflow (server only)

If you want hot-reloads on the server without rebuilding the container, run Postgres in Docker and the server on the host:

```bash
docker compose up -d postgres
# In your .env, change DATABASE_URL to use localhost instead of the postgres service name:
#   DATABASE_URL=postgresql://bartrivia:bartrivia@localhost:5432/bartrivia
npm install
npm run dev:server
```

The server reads `.env` from the repo root regardless of cwd (resolved relative to `main.ts`). An end-to-end smoke test of the whole journey lives at `packages/server/test/golden-path.mjs`: with the server running, `cd packages/server && SERVER_URL=http://localhost:3000 node test/golden-path.mjs`.

## Testing

Unit tests run on [Vitest](https://vitest.dev) from the repo root — no database or running server required:

```bash
npm test            # run the suite once
npm run test:watch  # watch mode
npm run test:coverage
```

They cover the logic-heavy core: the shared Zod schemas (`packages/shared/test/`) and the server's services, guards, and room-state machine (`packages/server/test/unit/`). Prisma, argon2, and the clock are mocked, so the suite is fast and deterministic. The full request/socket flow is covered separately by the end-to-end scripts in `packages/server/test/*.mjs` (see the note above), which need a running server.

## Architecture

```mermaid
flowchart TB
    tv["TV display<br/>(React web, kiosk)"]
    player["Player mobile<br/>(React web PWA)"]
    host["Host mobile<br/>(React web PWA)"]
    api["API server<br/>(Node + TS)"]
    db[("Persistent store<br/>(Postgres + Prisma)")]

    tv <-->|REST + WebSockets| api
    player <-->|REST + WebSockets| api
    host <-->|REST + WebSockets| api
    api --- db
```

The server owns all authoritative game state. Clients send actions (join room, submit answer, advance question) via REST, and receive state transitions via WebSockets.

## Clients

All three clients are React web apps. No React Native / Expo in MVP — see [docs/requirements.md, "Resolved"](docs/requirements.md#resolved) for the rationale.

- **TV display** (`packages/tv`) — plain React web app, fullscreen kiosk-style. The bar opens the URL in Chrome on a TV/stick PC and leaves it there. Shows the current question, choices, countdown timer, live scoreboard, and round/game transitions. Not a PWA (no install, no service worker — service workers cache aggressively and would slow bug fixes reaching the TV).
- **Player mobile** (`packages/player`) — React web app, mobile-first, PWA-installable. Players scan the TV's QR code and play in their phone's browser. No App Store install wall — that's load-bearing for the guest-play UX (see [docs/requirements.md §5.2](docs/requirements.md#52-joining-a-game)). PWA install (home-screen icon, full-screen mode) is opt-in for repeat players.
- **Host mobile** (`packages/host`) — React web app, mobile-first, PWA-installable. Same tech stack as the player. The host creates a room, picks a question pack, controls pacing, manages players, ends the game.

## Server

NestJS on Node.js + TypeScript, using the Express v5 adapter. Responsibilities:

- Game state machine (room lifecycle, rounds, questions, scoring)
- Player and host accounts
- Room code allocation
- Question pack storage and retrieval
- Realtime broadcast to room participants via Socket.IO (`@nestjs/platform-socket.io`)
- Authentication and authorization (guards, strategies, JWT)

## Auth model

Three identity tiers, all issued JWTs (short-lived access + refresh tokens). Role-based authorization (`guest`, `player`, `host`, `admin`).

| Tier                  | How they join                                          | What they get                                                                                                                                        |
| --------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guest player**      | Room code + display name. No signup.                   | Play the current game. Session ends when the room ends.                                                                                              |
| **Registered player** | Email/password or Google OAuth.                        | Everything a guest gets, **plus**: lifelines (phone-a-friend, ask-a-neighbor, 50/50 remove-a-false-choice), persistent stats, game history, profile. |
| **Host**              | Email/password or Google OAuth. Always a full account. | Create and run games. Owns question packs. Game history and analytics.                                                                               |

Design intent: zero-friction entry for the casual bar player, with registration as a real upgrade path rather than a wall.

## Realtime

Socket.IO pushes game state transitions from the server to every client in a room:

- Question shown / hidden
- Answers locked
- Lifeline activated
- Scores updated
- Round and game transitions

Clients render off the broadcast; they do not compute authoritative state locally.

## Repo layout

Monorepo with npm workspaces.

```
bar-trivia/
├── docs/             # design notes, ADRs, API contracts
├── packages/
│   ├── server/       # Node + TS API + WebSocket server
│   ├── tv/           # React web app for the bar TV
│   ├── player/       # React web (PWA, mobile)
│   ├── host/         # React web (PWA, mobile)
│   └── shared/       # shared TS types, API client, validation schemas
└── README.md
```

## Next steps

Documents done (the design):

- [x] Pick server stack (NestJS on Express v5; see [ADR 0001](docs/0001-server-stack.md))
- [x] Pick database (Postgres + Prisma; see [ADR 0002](docs/0002-database.md))
- [x] Draft MVP requirements ([docs/requirements.md](docs/requirements.md))
- [x] Decide client tech stack: all three clients are React web (TV is plain web, player + host are PWAs) — see [docs/requirements.md, "Resolved"](docs/requirements.md#resolved)
- [x] Competitive landscape survey ([docs/competitive-landscape.md](docs/competitive-landscape.md))
- [x] Auth ADR — hybrid JWT + Postgres refresh tokens, dual-ID identity, argon2id ([ADR 0004](docs/0004-auth.md))
- [x] v0 cut-list — the scope ceiling for what "playable at bar #1" actually means ([docs/v0-cut-list.md](docs/v0-cut-list.md))

v0 vertical slice — built:

- [x] Workspaces scaffolded: `packages/shared` (Zod schemas), `packages/server` (NestJS + Socket.IO + `/health`)
- [x] Local dev tooling: `.nvmrc`, `docker-compose.yml` for Postgres — see [Running locally](#running-locally)
- [x] Prisma schema and migration: User (role enum), RefreshToken, Pack, Question (`data: jsonb`), Room, RoomParticipant, GameResult
- [x] All three clients scaffolded and wired to the server: `packages/tv`, `packages/player`, `packages/host`
- [x] End-to-end vertical slice: host creates a room, guests join, full multi-question game with scoring, reveal, and final podium (`packages/server/test/golden-path.mjs`)

Not yet started (later):

- [ ] `docs/api.md` — formal REST + Socket.IO event contracts
- [ ] Registered-player lifelines (phone-a-friend, ask-a-neighbor, 50/50) and persistent stats
- [ ] Google OAuth for player/host accounts
