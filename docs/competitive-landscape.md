# Competitive landscape: open-source trivia apps

Survey of popular open-source trivia / bar-trivia / Kahoot-style projects on GitHub, captured 2026-05-20. Purpose: validate architectural choices in this repo against what well-watched projects in the same space actually do, and identify patterns worth borrowing or gaps worth exploiting.

## Summary

Projects in this space cluster into three patterns:

1. **Kahoot clones** — classroom/educator feel; one host, many players, no separate TV surface.
2. **Bar / party games** — host + TV + phones triangle; closest to what this repo is building.
3. **HQ Trivia clones** — single live-show stream, many concurrent players, elimination format.

All converge on the same core architecture this repo has already locked in: server-authoritative state, WebSockets for push, REST for actions, room-code join. That convergence is a useful validation signal for [ADR 0001](0001-server-stack.md).

## Kahoot-style clones (the dominant pattern)

### [supabase-community/kahoot-alternative](https://github.com/supabase-community/kahoot-alternative)

~159 stars. Next.js + Supabase + Tailwind.

Two routes: `/` for players, `/host` for the host. Game code join, host launches rounds, server pushes results. Deployed demo at kahoot-alternative.vercel.app.

Appeal: minimal stack, MIT-licensed, sponsored by Supabase so it's a credible reference for realtime patterns. The radically simple two-route split is worth studying — it suggests the host/player divide may not need to be two separate packages until lifelines actually arrive.

### [Arc676/Toohak](https://github.com/Arc676/Toohak)

Java, socket-based, LAN-only. Appeal: works without internet, useful for offline events. Not relevant to this repo's architecture but interesting as a "what if the bar Wi-Fi dies entirely" thought experiment.

### [soleilvermeil/open-kahoot](https://github.com/soleilvermeil/open-kahoot)

Next.js + Socket.IO + TypeScript. Closest tech-stack analogue to this repo's planned client side.

## Bar / party games (closest to this repo's use case)

### [EmanTemplar/TriviaForge](https://github.com/EmanTemplar/TriviaForge)

~12 stars. Vue 3 + Node + Socket.IO + Postgres. **Worth a careful read.**

Has the exact three-role split this repo is planning:

- **Admin** — pack management, Excel bulk import, question bank with tags, duplicate detection.
- **Presenter** — live quiz control, server-side auto-mode timers, real-time answer tracking, kick/ban.
- **Player** — mobile-optimized, persistent UUID identity, reconnection with full state preservation.
- **Display mode** — large-screen spectator view, live answer distributions, animated reveals.

Other notable features:

- **Dual-ID session model** (PlayerID + RoomSessionID) for seamless reconnection. This is the reliability pattern most worth borrowing for the bar Wi-Fi use case.
- Server-side timers (independent countdown execution, not client-driven).
- Configurable rate limiting on the socket layer.
- Docker Compose deploy with auto DB init.

Appeal: production-shaped feature set, the most architecturally similar project to this repo.

### [potentPotables/potentPotables](https://github.com/potentPotables/potentPotables)

~31 stars. React/Redux + Socket.IO + Mongo. Jeopardy-style "same-room party game" for 1-100 players.

Host drives from a computer, gameboard shown on TV/projector, players answer on phones. Pulls questions from jservice.io.

Appeal: confirms the "TV + host + phones" triangle is a real, well-trodden pattern, not a novel design. Documented limitation: the host having to switch between the main display and their phone is friction worth designing around in this repo (host-on-phone is the locked decision here, so the friction surfaces differently).

### [joshrehanek/bar-trivia-simulator](https://github.com/joshrehanek/bar-trivia-simulator)

Solo "missing the pub" app using Open Trivia DB + CocktailDB. Not multiplayer. Included only because it's the one repo literally named "bar trivia." Not architecturally useful.

## HQ Trivia clones (live-show style)

### [alexsmartens/HQ-Trivia](https://github.com/alexsmartens/HQ-Trivia) and [mesimplybj/trivia-quiz-game](https://github.com/mesimplybj/trivia-quiz-game)

Synchronous live-show format. One show host, many concurrent players, elimination on wrong answer.

Different feel from bar trivia (no host-as-MC for a single venue, no room codes, mass-broadcast model) but useful references for scale and synchronized-timer patterns if this repo ever grows toward "league night across many bars on the same questions."

## Common appeal patterns across the field

1. **Frictionless join.** QR code or 4-6 char room code; no account. Every successful project optimizes for this. Validates the "guest play first-class" invariant in [CLAUDE.md](../CLAUDE.md).
2. **TV/projector as a first-class surface.** potentPotables and TriviaForge both treat the big screen as its own client, not a host UI projected onto a wall. Matches this repo's three-client split.
3. **Server-side timers.** TriviaForge explicitly calls this out as a stability win. Reinforces the server-authoritative invariant.
4. **Reconnection with state preservation.** TriviaForge's dual-ID model is the most-cited reliability feature. Bar Wi-Fi makes this non-negotiable here too. Worth lifting the dual-ID pattern directly.
5. **Question pack import.** Excel/CSV bulk import is a recurring "this is what hosts actually want" feature. File for the host roadmap; not MVP, but the data model should not foreclose it.

## Gaps in the field (this repo's opportunity)

None of the surveyed projects implement **lifelines** (phone-a-friend, ask-a-neighbor, 50/50) as an account-gated upgrade. The Kahoot clones treat all players equally; the bar/party games don't have stats progression. The guest-vs-account upgrade hook is genuinely differentiated.

The other gap is **venue identity** — none of these projects model "this trivia night happens every Tuesday at this bar" as a first-class entity. They're all one-shot game sessions. Whether that's worth modeling here is a product question, not an architecture one, but flagging it as a possible differentiator.

## Sources

- [trivia-game topic on GitHub](https://github.com/topics/trivia-game)
- [supabase-community/kahoot-alternative](https://github.com/supabase-community/kahoot-alternative)
- [Arc676/Toohak](https://github.com/Arc676/Toohak)
- [soleilvermeil/open-kahoot](https://github.com/soleilvermeil/open-kahoot)
- [EmanTemplar/TriviaForge](https://github.com/EmanTemplar/TriviaForge)
- [potentPotables/potentPotables](https://github.com/potentPotables/potentPotables)
- [joshrehanek/bar-trivia-simulator](https://github.com/joshrehanek/bar-trivia-simulator)
- [alexsmartens/HQ-Trivia](https://github.com/alexsmartens/HQ-Trivia)
- [mesimplybj/trivia-quiz-game](https://github.com/mesimplybj/trivia-quiz-game)
- [Splode/open-trivia-app](https://github.com/Splode/open-trivia-app)
- [bvtrinh/tuning](https://github.com/bvtrinh/tuning)
- [bilafish/multiplayer-trivia-game](https://github.com/bilafish/multiplayer-trivia-game)
