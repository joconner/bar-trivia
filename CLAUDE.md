# CLAUDE.md — bar-trivia

Project-specific instructions. Loaded on top of `~/CLAUDE.md`; only repo-specific guidance lives here.

## Project status

v0 vertical slice implemented and runnable end-to-end. The stack is scaffolded and wired: `packages/shared` (Zod schemas), `packages/server` (NestJS + Socket.IO + Postgres/Prisma), and all three React clients (`packages/tv`, `packages/player`, `packages/host`). A host can create a room, guests can join, and a full multi-question game runs with scoring, reveal, and a final podium (covered by `packages/server/test/golden-path.mjs`). ADRs 0001 (server stack), 0002 (database), and 0004 (auth) are locked; product/behavioral requirements for MVP are in [docs/requirements.md](docs/requirements.md). To run the stack locally, see [Running locally](README.md#running-locally). Not yet built: registered-player lifelines and persistent stats, Google OAuth, and a formal `docs/api.md` contract.

## Product in one paragraph

Live trivia for bars. A host runs a game from their phone, players answer on their phones, and a TV displays shared game state. Guest play is the default low-friction path (room code + display name, no signup). Full accounts unlock player lifelines (phone-a-friend, ask-a-neighbor, 50/50 remove-a-false-choice), persistent stats, and history. Hosts always have full accounts.

## Architecture invariants

These are load-bearing decisions. If a future change conflicts with one of these, surface it explicitly rather than quietly working around it.

- **Server-authoritative game state.** Clients render off WebSocket broadcasts. Clients do not compute authoritative state (scores, timer, current question) locally. Optimistic UI is fine; authority is not.
- **Three clients, one server.** All three are React web apps. TV is a plain web app for the bar's kiosk display. Player and host are PWAs (mobile web, optionally home-screen-installable). One Node + TypeScript API.
- **REST for actions, WebSockets for state.** Clients POST actions (join, submit answer, advance) over REST. Server pushes state transitions over WebSockets to every participant in the room.
- **Guest play is first-class.** Joining a game must never require an account. Lifelines and stats are the upgrade hook, not the entry point. Pushback welcome if a feature tempts us to gate basic play.
- **Monorepo with workspaces.** New packages land in `packages/<name>`, not at the repo root. Shared types and the API client live in `packages/shared`.

## Auth model

JWT-based (short-lived access + refresh). Roles: `guest`, `player`, `host`, `admin`.

- `guest` — room code + display name; ephemeral; cannot use lifelines or accumulate stats.
- `player` — email/password or Google OAuth; can use lifelines, has persistent stats and history.
- `host` — full account always; owns question packs and game history.
- `admin` — operational role; not yet defined in detail.

When designing endpoints, default authz to "deny, then opt in per role." Never trust the client to tell us its role.

## Repo layout intent

```
bar-trivia/
├── docs/         # design notes, ADRs, API contracts
├── packages/
│   ├── server/   # Node + TS API + WebSocket server
│   ├── tv/       # React web (bar TV display)
│   ├── player/   # React web (PWA, mobile)
│   ├── host/     # React web (PWA, mobile)
│   └── shared/   # TS types, API client, validation schemas
└── README.md
```

Only `docs/` exists today; the rest is aspirational.

## Deferred decisions

Open choices. Do not silently pick one when implementing; surface the decision. Product/behavioral deferrals live in [docs/requirements.md](docs/requirements.md#deferred-decisions); the items here are technical-architecture deferrals only.

- OAuth provider details (Google client setup, callback URLs)

## Locked decisions

Do not re-litigate these without a strong reason. Full rationale lives in the linked ADRs.

- **Framework: NestJS** on **Express v5**. NestJS for structure, DI, guards, and gateways. Express adapter (not Fastify) because Socket.IO + NestJS + Fastify has unresolved compatibility issues (nestjs/nest #14953, #9903) — Socket.IO upgrade requests are intercepted by Fastify's HTTP handler before WebSocket handshake can complete. See [ADR 0001](docs/0001-server-stack.md).
- **Realtime: Socket.IO** via `@nestjs/platform-socket.io`. Rooms, reconnection, and heartbeats are built in — important for bar Wi-Fi reliability. See [ADR 0001](docs/0001-server-stack.md).
- **Validation: Zod** schemas in `packages/shared`, integrated into NestJS via `nestjs-zod`. Schemas are the source of truth for both runtime validation and TypeScript types (`z.infer<typeof Schema>`). No hand-maintained interfaces alongside schemas. See [ADR 0001](docs/0001-server-stack.md).
- **Workspace manager: npm workspaces**. Default Node tooling, no extra install step, simple `overrides` semantics for transitive security pins. No multi-package-manager complexity now that all three clients are plain React web (no React Native / Expo).
- **Database: Postgres + Prisma**, with `jsonb` for clearly document-shaped data (question pack content, event payloads). Live in-flight `Room` state stays in process memory, not the database. If multi-server scale forces it, the answer is Redis (for Socket.IO pub/sub and live room state) — not Mongo or a second SQL table. Data stored as `jsonb` is validated on read against a Zod schema in `@bar-trivia/shared`. See [ADR 0002](docs/0002-database.md).
- **All clients are React web**. `packages/tv` is a plain web app (kiosk display on the bar's TV); `packages/player` and `packages/host` are PWAs (mobile web, optionally home-screen-installable). No React Native / Expo in MVP. Rationale: the friction case for guest play (scan QR, play in 10 seconds) is incompatible with an App Store install wall, and the host case is one operator per bar — install friction is acceptable but not enough to justify a native build pipeline this early. Reconsider native for `packages/player` only if app-store discoverability becomes a real acquisition channel; reconsider for `packages/host` only on concrete operational pain from hosts.

## Conventions

- File and directory names: kebab-case.
- TypeScript everywhere a TS option exists. No JS files in new packages without a reason.
- ADRs and design notes go in `docs/` as plain Markdown.
- Diagrams use Mermaid in fenced ```mermaid blocks so GitHub renders them inline. Applies to README, ADRs, and any docs that need a visual. Plain monospace trees (directory layouts) are exempt since Mermaid makes them less readable.

## Things to ask before doing

- Picking any of the deferred decisions above.
- Adding a dependency to a package that doesn't exist yet (means we're also implicitly scaffolding the package).
- Anything that gates guest play behind an account.
