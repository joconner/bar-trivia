# ADR 0001: Server framework, realtime transport, and validation strategy

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** John O'Conner

## Context

The bar-trivia server is the authoritative owner of game state for three clients (TV display, player mobile, host mobile). It needs to:

1. Expose a REST API for actions (auth, room lifecycle, account management).
2. Push live game state to every client in a room with low latency and reliable reconnection over flaky bar Wi-Fi.
3. Validate every payload that crosses a trust boundary — REST bodies and Socket.IO event payloads — using contracts that can also be consumed by the three clients to avoid drift.
4. Be approachable for a Node/TS engineer who is leaning heavily on Claude Code as a learning and productivity aid.

## Decisions

### 1. Framework: NestJS on Express v5

We use **NestJS 11** with the **Express v5 adapter** (not Fastify).

Rationale:

- NestJS's module system, dependency injection, guards, and gateways give the project structure it needs to scale past one contributor without re-inventing conventions. The opinionated structure is also a strong fit for a developer who wants to "pick up as much standard framework as possible" — every controller, service, module, and guard has a canonical place.
- We chose the Express adapter over Fastify because Socket.IO + NestJS + Fastify has unresolved compatibility issues: Socket.IO's WebSocket upgrade requests are intercepted by Fastify's HTTP handler before the handshake can complete. See [nestjs/nest #14953](https://github.com/nestjs/nest/issues/14953) and [nestjs/nest #9903](https://github.com/nestjs/nest/issues/9903). The Express adapter is the documented path for Socket.IO + NestJS and has no analogous issues.
- The Fastify performance advantage (~2× throughput) is irrelevant for a game server measured in dozens of concurrent players per room.

Alternatives considered:

- **Bare Express or Fastify.** Less structure, more freedom, but the project would re-invent the patterns NestJS already provides (DI, guards, gateway typing). Rejected as a step backward for a multi-role auth surface.
- **NestJS on Fastify.** Performance gain not worth the Socket.IO friction.
- **AdonisJS, Feathers, Hono, Elysia.** Rejected as either over-opinionated for our model (Adonis), too niche (Feathers, H3), or incompatible with our stateful Socket.IO need (Hono, Elysia).

### 2. Realtime: Socket.IO via `@nestjs/platform-socket.io`

We use **Socket.IO 4** through NestJS's official platform adapter.

Rationale:

- Rooms are a first-class primitive (`socket.join(roomCode)`), which maps directly onto our domain.
- Built-in reconnection, heartbeats, and fallback transports matter on bar Wi-Fi.
- Typed event contracts via `Server<>` and `Socket<>` generics give us end-to-end type safety from server gateway to every client, using the same `ServerToClientEvents` / `ClientToServerEvents` interfaces exported from `packages/shared`.

Alternatives considered:

- **Native `ws` / `socket.io-client` alternatives (e.g. native WebSocket).** Lighter, but we would build rooms, reconnection, and heartbeats ourselves. Rejected as wasted effort.
- **Server-Sent Events + REST.** One-way push, simpler protocol, but does not handle client→server actions and would require a second channel anyway. Rejected.
- **Polling only.** Higher latency, higher server load, worse UX. Rejected.

### 3. Validation: Zod via `nestjs-zod`

All payloads — REST request bodies, query parameters, Socket.IO event payloads, and environment variables — are validated against **Zod schemas defined in `packages/shared`**. The NestJS integration uses **`nestjs-zod`** for `ZodValidationPipe` and OpenAPI generation.

Rationale:

- **One source of truth.** A Zod schema exports both a runtime validator and a TypeScript type via `z.infer<typeof Schema>`. The server cannot accept a payload that the client cannot also validate or type-check against. This eliminates the class of drift bugs where DTOs in the server and matching interfaces in `packages/shared` fall out of sync.
- **Cross-package portability.** Zod schemas are plain JavaScript modules with no decorator metadata. They work identically in the NestJS server, the React TV client, and the React Native mobile clients. NestJS DTOs (`class-validator` + `class-transformer`) are server-only because of decorator metadata requirements.
- **Socket.IO payload validation.** Zod schemas validate WebSocket event payloads cleanly. NestJS's standard `ValidationPipe` is HTTP-focused; using DTOs for gateway message bodies is the less well-trodden path.
- **Ecosystem momentum.** As of mid-2026, Zod is downloaded ~19× more often than `class-validator` (168M vs. 9M weekly), the gap is widening, and `class-validator` maintenance is sporadic. NestJS itself has open requests for first-party Zod support ([#10974](https://github.com/nestjs/nest/issues/10974), [#15988](https://github.com/nestjs/nest/issues/15988)). Picking Zod aligns with where the ecosystem is going, not just where it currently is.

Alternatives considered:

- **`class-validator` + `class-transformer` (NestJS-canonical).** The default NestJS pattern. Rejected primarily because client packages cannot consume DTO classes without a decorator/metadata setup we would have to maintain in three places, and because we explicitly want validation schemas to live in `packages/shared` per [CLAUDE.md](../CLAUDE.md). The drift problem this introduces was directly observed during scaffolding review.
- **Hybrid (`class-validator` for HTTP, Zod elsewhere).** A common 2026 community recommendation. Rejected because the duplication is exactly what we're trying to avoid; a single schema language across all trust boundaries is simpler.
- **Joi, Yup, Ajv.** Less momentum in the TypeScript-first ecosystem; weaker type inference than Zod.

## Consequences

Positive:

- Typed contracts (REST + WebSocket + auth) flow from `packages/shared` to every package with zero hand-maintained duplication.
- Validation logic is identical on server and clients — clients can pre-validate user input before hitting the network.
- Onboarding a new package (e.g. the planned `packages/tv`, `packages/player`, `packages/host`) requires only `npm install` and `import { ... } from '@bar-trivia/shared'`.

Negative:

- Zod is not the NestJS-canonical validator, so code samples and tutorials from the official NestJS docs use `class-validator`. We rely on `nestjs-zod` for the integration glue (`ZodValidationPipe`, `createZodDto`, OpenAPI bridge).
- Decorators are still required for NestJS itself (controllers, modules, gateways) — Zod replaces validation decorators, not framework decorators.
- We depend on the continued maintenance of `nestjs-zod`. If that package ever stalls, the integration glue is small (~50 lines) and can be inlined.

## Invariants this ADR establishes

These are load-bearing rules for future work:

- Validation schemas live in `packages/shared/src/schemas.ts` (or co-located domain files). They are the source of truth for both runtime shape and TypeScript type.
- Types that describe wire shapes (request bodies, response bodies, event payloads) are derived via `z.infer` from a schema, not declared independently.
- The Express adapter for NestJS is not changed casually. Switching to Fastify reopens the Socket.IO compatibility issues this ADR explicitly avoids.
- Socket.IO gateways are typed with `Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>` so the compiler catches event-name and payload mismatches.
