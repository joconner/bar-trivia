# CLAUDE.md — bar-trivia

Project-specific instructions. Loaded on top of `~/CLAUDE.md`; only repo-specific guidance lives here.

## Project status

v0 vertical slice implemented, runnable end-to-end, and deployable. The full stack is wired: `packages/shared` (Zod schemas), `packages/server` (NestJS + Socket.IO + Postgres/Prisma), and all three React clients (`packages/tv`, `packages/player`, `packages/host`). A host registers, picks a question pack, and runs a multi-game room; guests join with no account; a full game runs through lobby → questions → reveal → final podium with server-authoritative scoring (covered end-to-end by `packages/server/test/golden-path.mjs` and `family-scenario.mjs`).

Built since the original scaffold:
- **Question packs**: a `Pack → Game → Question` hierarchy with in-app authoring (host controllers under `packages/server/src/packs`). Five shared "house" packs (General Knowledge, History, Science, Pop Culture, Sports) are seeded from the [Open Trivia Database](https://opentdb.com) (CC BY-SA 4.0) and owned by a synthetic house user — visible to every host, editable only by their owner. Packs support soft-delete (`deletedAt`).
- **Subscription billing**: Stripe-backed host subscriptions (`packages/server/src/subscriptions`). Hosts get a 14-day trial; creating a room is gated behind an active/trialing subscription. Guest and player play are never gated.
- **Deployment**: Docker Compose (canonical local stack), Render (free-tier, SQLite, zero-credential), and Railway (Postgres, persistent). A marketing landing page lives in `docs/landing/`.

Not yet built: registered-player lifelines and persistent stats, Google OAuth, and a formal `docs/api.md` contract. ADRs 0001 (server stack), 0002 (database), and 0004 (auth) are locked. Product/behavioral requirements for MVP are in [docs/requirements.md](docs/requirements.md); the shippable scope ceiling is [docs/v0-cut-list.md](docs/v0-cut-list.md). To run the stack locally, see [Running locally](README.md#running-locally).

## Product in one paragraph

Live trivia for bars. A host runs a game from their phone, players answer on their phones, and a TV displays shared game state. Guest play is the default low-friction path (room code + display name, no signup). Full player accounts are intended to unlock lifelines (phone-a-friend, ask-a-neighbor, 50/50 remove-a-false-choice), persistent stats, and history — not yet implemented. Hosts always have full accounts and (post-trial) a paid subscription.

## Architecture invariants

These are load-bearing decisions. If a future change conflicts with one of these, surface it explicitly rather than quietly working around it.

- **Server-authoritative game state.** Clients render off WebSocket broadcasts. Clients do not compute authoritative state (scores, timer, current question) locally. Optimistic UI is fine; authority is not.
- **Live room state lives in process memory.** The authoritative in-flight game is a `RoomState` object (`packages/server/src/rooms/room-state.ts`) with phases `lobby → question → reveal → final`, held in `RoomStateStore`, not the database. Postgres persists durable records (users, packs, rooms, results); it is not the source of truth for the tick-by-tick game. The DB `RoomStatus` enum is intentionally coarse (`lobby`/`final`) for that reason.
- **Three clients, one server.** All three are React + Vite web apps. TV is a plain web app for the bar's kiosk display. Player and host are PWAs (mobile web, optionally home-screen-installable). One Node + TypeScript API.
- **REST for actions, WebSockets for state.** Clients POST actions (join, submit answer, advance) over REST. Server pushes state transitions over WebSockets (Socket.IO) to every participant in the room.
- **Guest play is first-class.** Joining a game must never require an account or a subscription. Lifelines, stats, and billing are host/upgrade concerns, not the entry point. Pushback welcome if a feature tempts us to gate basic play.
- **Monorepo with workspaces.** New packages land in `packages/<name>`, not at the repo root. Shared types, schemas, and constants live in `packages/shared` and are imported as `@bar-trivia/shared`.

## Data model

Prisma schema at `packages/server/prisma/schema.prisma` (Postgres). A parallel `schema.sqlite.prisma` exists only for the zero-credential Render demo — keep the two in sync when changing models.

- **User** — `role` enum (`guest`/`player`/`host`/`admin`), optional `email`/`passwordHash`. Host billing fields live here: `stripeCustomerId`, `subscriptionStatus` (default `trial`), `trialEndsAt`.
- **RefreshToken** — hashed refresh tokens with rotation (`rotatedToId`), revocation, and device labels. See [ADR 0004](docs/0004-auth.md).
- **Pack → Game → Question** — a pack owns ordered games; a game owns ordered questions. Question content is `data: Json` (jsonb), validated on read against a Zod schema in `@bar-trivia/shared` (multiple-choice today). Per-game config: `lateJoinDefault`, `tiebreakerMethod`, `phoneTextMode`.
- **Room / RoomParticipant / GameResult** — durable room records, participant roster (with reconnect-friendly `isActive`/`lastSeenAt`), and per-game results (`results: Json`).

`jsonb` is for clearly document-shaped data only. Anything queried or joined gets real columns.

## Auth & authorization

JWT-based: short-lived access tokens + rotating refresh tokens (argon2id-hashed, stored in Postgres). Roles: `guest`, `player`, `host`, `admin`.

- `guest` — room code + display name; ephemeral; no lifelines or stats.
- `player` — email/password or (planned) Google OAuth; lifelines and persistent stats. Not fully built yet.
- `host` — full account always; owns question packs and game history; subscription-gated for running rooms.
- `admin` — operational role; not yet defined in detail.

**Authorization is "deny, then opt in."** Three global guards run on every request, in order (registered in `auth.module.ts`):
1. `JwtAuthGuard` — requires a valid access token unless the handler is `@Public()`.
2. `RolesGuard` — enforces `@Roles('host', ...)`. Never trust the client to tell us its role.
3. `SubscriptionActiveGuard` — enforces `@RequiresSubscription()` (host billing). Allows `active`/`trialing`/in-window `trial`; flips an expired `trial` to `trial_expired` and returns `402 Payment Required`. Today only **room creation** (`POST /rooms`) is gated.

When adding endpoints, default to locked-down and opt in with decorators. Use `@Public()` deliberately — it is the only thing standing between an endpoint and an anonymous caller. Public, guest-facing routes today: room lookup, join, name reroll, the Stripe webhook, and auth (register/login/refresh/logout).

## Subscriptions / billing

Stripe lives in `packages/server/src/subscriptions`. It is **optional infrastructure**: without `STRIPE_SECRET_KEY` the service still boots, the 14-day trial still works, but `checkout`/`portal` return `503`. Webhook signature verification needs the raw request body — `main.ts` creates the app with `rawBody: true`; don't remove that. `subscriptionStatus` values seen across the code: `trial`, `trialing`, `active`, `past_due`, `cancelled`, `trial_expired`. Keep guest/player play free — billing is a host concern only.

## Repo layout

Monorepo with npm workspaces. All packages now exist (no longer aspirational).

```
bar-trivia/
├── docs/             # ADRs (0001/0002/0004), requirements, v0 cut-list, landing page
├── packages/
│   ├── server/       # NestJS API + Socket.IO gateway + Prisma; serves SPAs from dist/ in single-service deploys
│   ├── tv/           # React web (bar TV display, plain web app — no PWA)
│   ├── player/       # React web (PWA, mobile)
│   ├── host/         # React web (PWA, mobile)
│   └── shared/       # Zod schemas, shared types, socket events, constants (@bar-trivia/shared)
├── docker-compose.yml, Dockerfile.*, render.yaml, railway.toml   # local + deploy
└── README.md
```

Server module map (`packages/server/src`): `auth/`, `users/`, `packs/`, `rooms/` (REST controller + Socket.IO gateway + in-memory state store/machine), `subscriptions/`, `health/`, `prisma/`, `config/` (env schema, validated at boot).

## Development workflow

- **Install / run / build**: from the repo root. `npm run dev:server | dev:tv | dev:player | dev:host` start individual dev servers; `npm run build` / `npm run typecheck` fan out across workspaces. The canonical full local stack is `docker compose up --build` (Postgres + server + nginx serving all three clients on `:80`). See [README → Running locally](README.md#running-locally).
- **Database**: `npm run db:migrate` (= `prisma migrate deploy`). The server reads the repo-root `.env` regardless of cwd; `config/env.schema.ts` validates required vars at boot and refuses to start on missing/malformed values.
- **Tests**: `npm test` runs the Vitest suite from the root — fast and deterministic (Prisma, argon2, and the clock are mocked; no DB or running server needed). It covers the shared Zod schemas, server services/guards/room-state machine, and client logic (api/jwt/token-store). The full request+socket journey is covered by the e2e scripts `packages/server/test/golden-path.mjs` and `family-scenario.mjs`, which need a running server (`SERVER_URL=http://localhost:3000 node test/golden-path.mjs`).
- **Seeding**: `prisma/seed.ts` (run by `prisma db seed`) is idempotent and loads the house packs from `prisma/seed-content/shared-packs.json`. `npm run seed:pack` (workspace `packages/server`) imports a single pack.
- Before handing work back, run `npm test` and `npm run typecheck`.

## Deployment

Three supported targets (details in [README](README.md)):
- **Docker Compose** — local canonical stack; nginx serves the SPAs, server on `:3000`.
- **Render** — single free-tier web service via `render.yaml`; uses SQLite (`schema.sqlite.prisma`), no external DB or credentials. `JWT_SECRET`/`COOKIE_SECRET` auto-generated.
- **Railway** — single service via `railway.toml` + `Dockerfile.railway`; managed Postgres, persistent data, optional Stripe vars.

In single-service deploys the NestJS server serves each client's built `dist/` and redirects bare `/` to `/tv/` (see `main.ts`); in Docker, nginx handles that and the server code is inert. Cross-origin frontend hosting (e.g. Cloudflare Pages) is gated by `cors-allowlist.ts` / `ALLOWED_ORIGINS` and would require switching cookie `sameSite` to `none`.

## Locked decisions

Do not re-litigate these without a strong reason. Full rationale lives in the linked ADRs.

- **Framework: NestJS** on **Express v5**. NestJS for structure, DI, guards, and gateways. Express adapter (not Fastify) because Socket.IO + NestJS + Fastify has unresolved compatibility issues (nestjs/nest #14953, #9903) — Socket.IO upgrade requests are intercepted by Fastify's HTTP handler before the WebSocket handshake can complete. See [ADR 0001](docs/0001-server-stack.md).
- **Realtime: Socket.IO** via `@nestjs/platform-socket.io`. Rooms, reconnection, and heartbeats are built in — important for bar Wi-Fi reliability. See [ADR 0001](docs/0001-server-stack.md).
- **Validation: Zod** schemas in `packages/shared`, integrated into NestJS via `nestjs-zod` (`createZodDto`). Schemas are the source of truth for both runtime validation and TypeScript types (`z.infer<typeof Schema>`). No hand-maintained interfaces alongside schemas. See [ADR 0001](docs/0001-server-stack.md).
- **Workspace manager: npm workspaces**. Default Node tooling, no extra install step, simple `overrides` semantics for transitive security pins.
- **Database: Postgres + Prisma**, with `jsonb` for clearly document-shaped data (question content, result payloads). Live in-flight room state stays in process memory. If multi-server scale forces it, the answer is Redis (for Socket.IO pub/sub and live room state) — not Mongo or a second SQL table. `jsonb` is validated on read against a Zod schema in `@bar-trivia/shared`. The `schema.sqlite.prisma` variant exists solely for the credential-free Render demo. See [ADR 0002](docs/0002-database.md).
- **Auth: hybrid JWT + Postgres refresh tokens**, dual-ID identity, argon2id hashing, refresh-token rotation. See [ADR 0004](docs/0004-auth.md).
- **Billing: Stripe** for host subscriptions, with a server-side trial window. Optional at runtime (the app boots and trials work without Stripe keys). Never gate guest/player play.
- **All clients are React web**. `packages/tv` is a plain web app (kiosk display); `packages/player` and `packages/host` are PWAs (mobile web, optionally home-screen-installable). No React Native / Expo in MVP. The friction case for guest play (scan QR, play in 10 seconds) is incompatible with an App Store install wall, and the host case is one operator per bar. Reconsider native for `packages/player` only if app-store discoverability becomes a real acquisition channel; reconsider for `packages/host` only on concrete operational pain.

## Deferred decisions

Open choices. Do not silently pick one when implementing; surface the decision. Product/behavioral deferrals live in [docs/requirements.md](docs/requirements.md#deferred-decisions); the items here are technical-architecture deferrals only.

- OAuth provider details (Google client setup, callback URLs).
- The formal `docs/api.md` REST + Socket.IO event contract (events currently live in `packages/shared/src/events.ts`).

## Conventions

- File and directory names: kebab-case.
- TypeScript everywhere a TS option exists. No JS files in new packages without a reason (the `.mjs` e2e scripts are the deliberate exception).
- Schemas first: define a Zod schema in `packages/shared` and infer the type; do not hand-write a parallel interface.
- ADRs and design notes go in `docs/` as plain Markdown.
- Diagrams use Mermaid in fenced ```mermaid blocks so GitHub renders them inline. Plain monospace trees (directory layouts) are exempt.

## Things to ask before doing

- Picking any of the deferred decisions above.
- Adding a dependency to a package that doesn't exist yet (means we're also implicitly scaffolding the package).
- Anything that gates guest or player *gameplay* behind an account or a subscription.
- Changing the `Pack → Game → Question` shape, the auth guard order, or the Postgres/SQLite schema pair without keeping both schemas and the seed in sync.
