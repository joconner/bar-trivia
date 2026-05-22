# v0 cut-list: what "playable at bar #1" actually means

- **Status:** Accepted
- **Date:** 2026-05-21
- **Author:** John O'Conner (interviewed), drafted by Claude
- **Complements:** [docs/requirements.md](requirements.md) (the long-form MVP spec)

## Context

`docs/requirements.md` describes the full MVP — comprehensive, with ~30 in-scope features and 22 deferred decisions. For a solo engineer beta-launching at two hometown bars, that's 2-3× more scope than is shippable on a reasonable timeline.

This doc is the scope ceiling for **v0** — the first version a real bar host can actually run for a real trivia night. It's deliberately narrower than the MVP spec. Anything not listed here as "in v0" is deferred to a post-v0 milestone, with target milestones grouped at the bottom.

Every code decision — Prisma schema, package scaffolding, the first vertical slice — should be checked against this cut-list. If a feature isn't here, don't model it, don't scaffold it, don't slow down for it.

## What v0 ships

The decision tier (A = minimal, B = believable-product, C = ambitious) was walked per feature group. v0 lands on **B across the board** — the smallest cut that produces a credible product, not a demo.

| Feature group | v0 decision | Requirements ref |
|---|---|---|
| Question formats | Multiple choice (4 choices) + optional image per question | [§4.1 item 1](requirements.md#41-question-formats-mvp), [§4.4](requirements.md#44-question-media) |
| Scoring | 1 point per correct; server records per-question response times (needed for tie-breaking) | [§4.2](requirements.md#42-scoring) |
| Host pacing controls | Pause + advance | [§4.3](requirements.md#43-pacing) |
| Tie-breaking | Total response time | [§4.5](requirements.md#45-tie-breaking) |
| Game lifecycle | Lobby → questions → reveal → final leaderboard + podium animation; multi-game in same room | [§5](requirements.md#5-lifecycle-of-a-game), [§5.4](requirements.md#54-end-of-a-game) |
| Joining a game | Room code + QR code; generated display names with reroll; stable client ID for reconnection | [§5.2](requirements.md#52-joining-a-game) |
| Late-join policy | Per-game toggle (open/locked), host sets in lobby | [§5.2](requirements.md#52-joining-a-game) |
| Phone UX during a question | Heads-up A/B/C/D buttons only; no question text on phone | [§5.3](requirements.md#53-during-a-game) |
| Connection handling | Player / TV / host reconnect with state preservation; host disconnect → auto-pilot from timer | [§6](requirements.md#6-connection-handling) — non-negotiable |
| User accounts | Single registered host account per venue (email + password); players join as guests | [ADR 0004](0004-auth.md) |
| Pack authoring | In-app, basic form (one question at a time); image URLs typed in; no CSV import | [§7.1](requirements.md#71-authoring) |
| Moderation | Host kick; player names server-generated from curated word list | [§9](requirements.md#9-display-names--moderation) |
| Reliability | Single Node process, in-memory room state, Postgres for persistence | [§10.1](requirements.md#101-scale), [§10.2](requirements.md#102-reliability) |

## What v0 does NOT ship

Grouped by target milestone. Cut from v0 ≠ rejected — see the terminology note at the bottom.

### Deferred to v1 (next milestone after v0 ships)

- **True/false questions.** Trivially adjacent to MC in product terms, but ships the full discriminated-union complexity (Zod variants, second UI variant) before v0 needs it. Add when MC + images proves the format mechanics.
- **Free-text / short-answer questions.** Matching policy (case sensitivity, punctuation, edit distance, accepted-variants) is a deferred decision in [requirements.md item #1](requirements.md#deferred-decisions). Free-text also conflicts with the heads-up phone design (forces a keyboard surface). Add when the matching policy is settled and the phone-UX special case is worth carrying.
- **In-app pack import (CSV/JSON).** Competitive landscape ([docs/competitive-landscape.md](competitive-landscape.md)) flags bulk import as a frequent host ask, but it surfaces deferred decisions about file format, image storage rules, and duplicate detection. Add when those decisions are made.
- **Host extend control.** Largely redundant with pause. Add if real hosts ask for it.
- **Sudden-death tiebreaker.** Total response time covers the function. Add the second method when configurability is actually needed.
- **Owner role distinct from host.** v0 collapses owner and host into a single "host" account. Add when a venue with multiple employees rotating who runs trivia is a real customer.
- **Multiple host accounts per venue.** Same trigger as above.
- **Per-venue ban list.** Host kick covers in-game moderation; persistent bans are a v2-shape problem (recurring bad actor across nights). Add when there's a customer scenario for it.

### Deferred to v2 (already in [requirements.md §11](requirements.md#11-out-of-scope-for-mvp))

These are spec-level v2 items, named here for completeness:

- Ordering / matching questions
- Lifelines (phone-a-friend, ask-a-neighbor, 50/50)
- Registered player accounts, persistent stats, history
- Free-form player display names
- Audio and video questions
- Marketplace (paid packs, revenue share, billing)
- Prize-claim flow in app
- Push notifications
- Pre-scheduled sessions
- Round structure within a session
- Persistent teams across sessions
- Weekly / monthly champions
- Wager / final / bonus rounds

## Schema implications

The cut-list locks the discriminator + `jsonb` payload pattern for question content (per [ADR 0002](0002-database.md)'s "jsonb for clearly document-shaped data" provision):

- `QuestionType` enum has **one** value in v0: `multiple_choice`. Adding T/F, free-text, or ordering later is an additive enum migration + a code-only Zod variant addition — no column changes, no data migration on existing rows.
- `Question.imageUrl` is a nullable string column from day one. v0 supports images; saves a future migration when image-heavy packs arrive.
- `Question.data` is a `jsonb` column. For MC it holds `{ choices: Choice[], correctChoiceId: string }`. Validated on read against a Zod schema in `@bar-trivia/shared`. Future question types add new payload shapes without touching the table.

This is a deliberate tradeoff: type safety on the type-specific payload lives in Zod (runtime), not Prisma (compile time). Per [ADR 0002](0002-database.md), this is the correct cut.

## What "done" looks like for v0

A concrete user-journey statement that the cut-list collapses to:

> Maria walks into Murphy's at 8:15pm Tuesday. The TV shows "JOIN: code MURP" and a QR code. She scans, lands in the player web app, gets the name "Curious Pelican," rerolls twice, settles on "Plucky Otter." The host (a Murphy's employee logged in with the bar's host account) sees her in the lobby and starts the first game. Twenty MC questions, some with images, play out — phone shows A/B/C/D buttons only, TV shows everything. The host pauses once when a player needs the bathroom, kicks one player who's spamming joins, advances past one question early. Maria's phone briefly disconnects when she walks to the bar; she reconnects with score intact. At the end, the TV shows the final leaderboard and a top-3 podium animation. The host starts a second game from the same pack. Maria leaves at 10pm.

Anything required to ship this path is in v0. Anything else is deferred.

## Terminology note

"Cut from v0" means *not in this milestone*. It does **not** mean rejected. Cut items move forward to v1, v2, or beyond, as labeled above. The `requirements.md` long-form spec remains the source of truth for what *will eventually* exist; this doc is just the milestone ceiling.

When implementing v0, the rule is simple: if a code path, model, or UI element is required only for a deferred feature, **don't write it**. The migration cost when those features land later is real, but it's smaller than the cost of carrying half-implemented features through a v0 launch.
