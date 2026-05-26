# Bar Trivia

Live trivia game built for bars. A host runs the game from a phone, players answer on their phones, and a TV displays the shared game state (current question, scoreboard, timer). The platform aims to make joining frictionless for casual players while rewarding registered players with persistent stats and in-game lifelines.

> **Status:** v0 vertical slice implemented and runnable end-to-end — a NestJS + Socket.IO server, Postgres/Prisma persistence, and three React clients (TV, player, host). See [Running locally](#running-locally) to bring up the full stack on your machine. [CLAUDE.md](CLAUDE.md) holds the load-bearing decisions and [docs/requirements.md](docs/requirements.md) is the product/behavioral spec.

## Running locally

Brings up the API, Postgres, and all three clients on one machine.

**Prerequisites:** Node 22 (see [`.nvmrc`](.nvmrc)), npm 10+, and **either** Docker (simplest way to get Postgres) **or** a local Postgres 16.

### 1. Install dependencies

```bash
nvm use        # selects Node 22
npm install    # installs all workspaces; the server's postinstall also runs `prisma generate`
```

### 2. Start Postgres

**Option A — Docker (recommended).** Starts only the `postgres` service from [`docker-compose.yml`](docker-compose.yml) on `localhost:5432` (database, user, and password are all `bartrivia`):

```bash
docker compose up -d postgres
```

**Option B — local Postgres.** Create the database and a matching role:

```bash
createdb bartrivia
psql -d bartrivia -c "CREATE ROLE bartrivia WITH LOGIN PASSWORD 'bartrivia'; ALTER DATABASE bartrivia OWNER TO bartrivia;"
```

(Any database/credentials work — just make `DATABASE_URL` in the next step match.)

### 3. Configure the server environment

The server reads `packages/server/.env`. Copy the example and edit it:

```bash
cp .env.example packages/server/.env
```

Set `DATABASE_URL` to match your Postgres. For either option above:

```
DATABASE_URL=postgresql://bartrivia:bartrivia@localhost:5432/bartrivia
```

Also set `JWT_SECRET` to any 32+ character string. Keep `NODE_ENV=development` (so auth cookies are sent over plain `http://localhost`) and leave `CLIENT_ORIGINS` as-is — it already lists the three client ports.

### 4. Create the schema and seed demo data

```bash
cd packages/server
npx prisma migrate deploy   # creates the tables
npx prisma db seed          # optional: demo pack with 2 games / 40 questions
cd ../..
```

> Use `prisma db seed` (not `ts-node prisma/seed.ts` directly) — the seed script relies on Prisma's CLI to load `.env`.

### 5. Run the server and clients

Each runs in the foreground, so use four terminals (or background them):

```bash
npm run dev:server   # API + WebSocket → http://localhost:3000
npm run dev:tv       # TV display      → http://localhost:5173
npm run dev:player   # Player PWA      → http://localhost:5174
npm run dev:host     # Host PWA        → http://localhost:5175
```

The clients default to `http://localhost:3000` for the API, so no client-side config is needed for local dev.

### 6. Play a game

1. **Host** — open <http://localhost:5175>, click **Register** to create a host account, build a pack + game with a few questions, then create a room. You'll get a 4-character room code.
2. **TV** — open `http://localhost:5173/?roomCode=CODE` (replace `CODE`). Use the `?roomCode=` form: room codes can contain digits, which the bare `/CODE` path does not yet recognize.
3. **Players** — open <http://localhost:5174> in other tabs/devices and join with the room code. No account required.
4. Drive the game from the host; the TV and players update live over WebSockets.

**Notes:**
- The seeded "Trivia Host" account has no password (it only exists to own the demo pack), so register your own host account to sign in.
- To join from real phones instead of browser tabs, replace `localhost` with your machine's LAN IP and add that origin to `CLIENT_ORIGINS`.
- An end-to-end smoke test of the whole journey lives at `packages/server/test/golden-path.mjs`: with the server running, `cd packages/server && node test/golden-path.mjs`.

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
