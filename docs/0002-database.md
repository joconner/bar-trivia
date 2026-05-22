# ADR 0002: Database — Postgres + Prisma, with JSONB and a Redis-later note

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** John O'Conner
- **Supersedes / supersedes-by:** —

## Context

The bar-trivia server needs to persist:

- **Users** (registered players, hosts) — relational, low write volume, looked up by email/id.
- **Question packs** — ordered list of questions, each with choices and a correct answer. Read-heavy. Loaded whole when a game starts. Document-shaped in practice.
- **Rooms** during a live game — high write rate, ephemeral, document-shaped.
- **Game history** — append-only after each game ends. Read for player profiles and analytics.
- **Player stats** for registered players — incremented at game end, read on profile.

Some of this data is naturally relational (users → game participations → scores), some is naturally document-shaped (a question pack is a self-contained tree), and a slice of it (live room state) is hot enough that it may not belong in the primary database at all.

We considered the choice in context, not in the abstract — see "Alternatives considered" below.

## Decision

### 1. Postgres + Prisma is the primary datastore

- **Postgres 16+** as the relational store for users, packs (metadata), game history, and player stats.
- **Prisma** as the ORM. Single source of truth in `schema.prisma`; generated TypeScript client gives full type inference on every query.

### 2. Use `jsonb` columns where the data is genuinely document-shaped

Specifically:

- **Question pack content** — the full ordered list of questions, choices, and correct answers lives in a `jsonb` column on the pack row. Pack metadata (id, title, owner, created_at, etc.) stays as normal columns. Rationale: a pack is loaded whole; normalizing into `pack → question → choice` tables produces a 3-way join with zero query benefit, and the editing model is "save the whole pack" rather than "edit a single choice." `jsonb` is the right shape.
- **Event payloads / audit log entries** (when added) — store the structured payload as `jsonb`. Querying it is rare; storing it normalized would mean inventing a new table per event shape.

For everything else (users, game participations, scores), use normal columns and foreign keys. The default is relational; `jsonb` is opt-in for clearly document-shaped data.

### 3. Live room state is **not** in the primary database (initially)

While a game is in progress, the authoritative `Room` lives in process memory in the NestJS server. The database persists only:

- Pack content (loaded at room creation, embedded into the in-memory `Room`)
- Final game results (written when the game ends)

This is correct for a single-server deployment and avoids round-tripping every state transition through the database.

If/when a multi-server deployment becomes real (scale, redundancy, blue/green deploys), the realistic next step is:

- **Redis as a Socket.IO pub/sub adapter** (`@socket.io/redis-adapter`) so broadcasts reach clients connected to any server instance.
- **Redis as the live `Room` store** with a defined TTL, so any server instance can serve any room.

This is the "second database when we need it" — not Mongo, not a separate document store. Capturing it here so we don't reach for the wrong tool in six months.

## Rationale

- **Type safety as a first-class concern.** Prisma generates TS types from the schema. Combined with our Zod schemas in `@bar-trivia/shared`, the type story is: Zod = wire contract, Prisma = storage contract, TS = the language they share. Mongoose would add a third source of truth (Mongoose schemas with their own decorators and validation), which we explicitly avoided in [ADR 0001](0001-server-stack.md) by picking Zod over class-validator.
- **The data is mostly relational.** Player stats, game history, and user accounts are all classically relational. Mongo would require denormalization and manual joins ($lookup) for queries that Postgres does natively.
- **`jsonb` removes the historical advantage of document stores.** The one thing Mongo unambiguously did better than Postgres in 2010 — flexible, indexed document storage — has been a first-class Postgres feature for over a decade. `jsonb` columns are indexable, queryable, and atomically updatable. We get document flexibility where we need it without giving up SQL where it helps.
- **Analytics and reporting will exist eventually.** "What's the average score on this pack?" "Which player has the longest win streak?" "What's the pass rate per question?" — these are all natural SQL aggregates. Mongo can answer them with aggregation pipelines, but the developer experience and performance both favor SQL for this workload.
- **Hosting and ops are commodities.** Managed Postgres is everywhere (Supabase, Neon, RDS, Railway, fly.io). The cost curve is well-understood.

## Alternatives considered

### MongoDB + Mongoose

Rejected. The pros are real — `Room` and `Question Pack` map naturally onto documents, schema evolution is faster during scaffolding, and the in-memory model and the storage model look more alike. But:

- Adds a third type-source-of-truth (Mongoose schemas) alongside our Zod schemas and TS types. We just spent multiple commits eliminating drift between two sources; adding a third is the wrong direction.
- Weaker story for cross-entity analytics queries we'll want eventually.
- Schema evolution velocity is a scaffolding-phase concern; once handlers exist, Prisma migrations are not significantly more friction than Mongoose schema edits, and they're real reviewable artifacts.

### Postgres + Drizzle

Drizzle is a strong alternative ORM. Lighter, closer to SQL, better for power users. Rejected primarily because Prisma's generated types and migration ergonomics are unmatched for someone learning the ecosystem, and the NestJS + Prisma documentation density is higher than NestJS + Drizzle.

### SQLite

Rejected for the obvious reason — single-server, single-writer, no managed hosting story. Fine for a prototype, wrong for a multi-client realtime game.

### "Just Redis"

Rejected as a primary store. Redis is the right answer for live game state and Socket.IO pub/sub when we need it (see Decision §3), but it's not a durable record store. Game history and accounts need real durability.

## Consequences

Positive:

- Single durable store for the relational majority of the data, with `jsonb` escape hatches for document-shaped parts.
- Generated Prisma types compose with the existing Zod schemas in `@bar-trivia/shared`; nothing new to learn at the contract layer.
- Standard SQL analytics path open from day one.
- Future Redis adoption is an additive change, not a migration.

Negative:

- Migrations are real artifacts and must be reviewed and applied. This is friction during early scaffolding when `Room` and friends are still moving.
- `jsonb` columns lose some type safety on the data inside them. We mitigate this by validating reads with the same Zod schemas that define wire shapes — the data inside a `pack_content` column is a `QuestionPack` per `QuestionPackSchema`, and is parsed at the boundary.

## Invariants this ADR establishes

- The primary database is Postgres. Adding a second durable store requires its own ADR.
- ORM is Prisma. Switching ORMs requires its own ADR.
- `jsonb` is opt-in for clearly document-shaped data (pack content, event payloads). Default is relational.
- Live in-flight `Room` state is not in the primary database. When multi-server demands it, Redis is the answer, not a second SQL table or a document store.
- Data stored as `jsonb` is validated on read against a Zod schema in `@bar-trivia/shared`.
