# LinkedIn series: building bar-trivia with Claude Code

Three posts. Reflective build-in-public tone. Honest about the AI-collaboration angle. Plain text (LinkedIn does not render markdown), with line breaks for paragraphing.

Each post has one job:

1. **Post 1** — a lesson for engineering leaders about the spec-vs-code trap. Why I almost wrote a side project to death on paper.
2. **Post 2** — a demonstration that AI pair-programming has a hidden prerequisite. Speed is not magic; it is what happens when constraints are clear.
3. **Post 3** — a corrective to AI-hype. The thing an LLM pair cannot do for you, told through the bug that crashed my demo.

---

## Post 1 — A Spec is a Good Start

The project is bar trivia, live trivia for bars. A host runs the game from their phone, players answer on theirs, a TV in the venue shows the shared state. Why bar trivia? I wanted something that I could do start to finish with AI, Claude Code. I wanted to provide a report from the trenches.

Four weeks in, I had four architectural decision docs, a requirements doc, an open-questions list, an MVP cut-list, and nothing else. I did not have a single human who had played the game.

I caught myself drafting a seventh design doc and stopped.

Here's why I stopped. Three of the "must resolve before MVP" questions on my own list were product questions, not architecture ones. Partial credit on ordering. Free-text matching tolerance. Whether ties get broken at the game level or the round level. You can argue these on paper for weeks. You can also implement one version, watch four people play it, and know the answer in an hour.

The trap is that writing specs feels like progress. It is legible. It produces artifacts. It is also, on a side project with one engineer and no stakeholders, almost entirely a way to defer the moment of being wrong in public.

The fix was not to throw the documents away. The four ADRs were foundational. The architectural necessities — server-authoritative state, REST for actions and WebSockets for state, guest play — gave me something to build against. The fix was to stop adding to them and to start treating them as the contract the code had to honor.

For the engineering leaders reading this: if a project on your team has produced more spec than code for more than a sprint, the question to ask is not "what else do we need to document." It is "what is the smallest thing we can put in front of a real user, and what are we letting the document prevent us from finding out."

Next post: what happened the Saturday I finally opened the editor.

#buildinpublic #engineeringleadership

---

## Post 2 — Why AI pair-programming was fast (and why that is not the headline)

Saturday morning, 11:55am. Empty packages directory.
Saturday afternoon, 4:19pm. A playable, end-to-end trivia game with three React clients, a NestJS server, a real database, and an integration test walking the full fifteen-step user journey.

Ten commits. Four and a half hours. One person, pair-programming with Claude Code.

The number is real, and I want to be honest about what produced it, because the wrong lesson here is "AI made me ten times faster." That is not the lesson.

The lesson is that I had spent the previous four weeks writing down the constraints, and the AI was fast because the constraints were unambiguous.

The architectural invariants were in the repo's CLAUDE.md file before any code was written. Server-authoritative state. Three clients, one server. REST for actions, WebSockets for state transitions. Guest play first-class. Roles are guest, player, host, admin, with default-deny authz. None of these were negotiable, and because they were in the file, neither I nor the AI re-litigated them mid-task. When the host client needed to advance a question, there was no conversation about whether the host could compute the next question locally. The rule was already on the page.

That is the prerequisite nobody puts on the marketing slide. An LLM pair-programmer is fast when it can read the contract. It is mediocre, and sometimes worse than working alone, when the contract lives only in your head.

The other thing that mattered that Saturday was the golden-path integration test. Fifteen steps, one command, the full user journey from "host creates room" through "final podium." It is a forty-second test. It is the thing that lets me change anything in the stack and know whether I broke the experience before I have to find out from a player.

If you are leading a team thinking about how to use AI tools well, the takeaway is this. The leverage is not in the typing speed. It is in writing down the constraints crisply enough that a fast collaborator can move without you re-explaining them every turn. That work is hard, it is unglamorous, and it is the multiplier.

Next post: the demo that hung at question nine, and the thing my AI pair could not save me from.

#buildinpublic #engineering #ai

---

## Post 3 — What the AI pair could not do

I was nine questions into a ten-question demo when the TV said "Reconnecting" and never came back.

Nobody in the room knew why. I did not know why for about an hour.

The cause was JWT expiry. The access token had a fifteen-minute lifetime. The clients had no refresh logic. Once the token died, the player sockets dropped, the reconnects came back with "invalid token," and the host could no longer advance the question. The game state machine wedged with no signal to the operator that the problem was authentication and not the bar's Wi-Fi.

The band-aid that night was to bump the access token to four hours. The fact that "four hours" was even a reasonable band-aid tells you everything about the maturity of the system at that point.

The real fix landed two days later. Single-flight refresh shared between REST and the socket transport, so concurrent triggers cannot rotate the refresh cookie twice and trip reuse detection. Proactive refresh about ninety seconds before expiry. Atomic claim-rotation on the server with a thirty-second grace window, so a benign double-refresh from a flaky connection does not get mistaken for a stolen token.

There was a sibling bug from the same week that I am more embarrassed by. The TV's QR code derives the player join URL from window.location.hostname at runtime. I had opened the TV browser at localhost during a practice run. The QR encoded "http://localhost/player/join/...". No phone in the room could reach it. There was no error. The QR just did not work. It now has a localhost-guard that replaces the code with a loud warning telling the operator to reopen the TV at the LAN IP.

Here is the part of this post that matters.

Claude Code wrote the real fix for the JWT bug. It wrote the single-flight wrapper, the rotation race, the grace window. Cleanly, with the right tests, faster than I would have written it alone. It was indispensable for the part of the work where I knew what was broken.

It could not have caught the bug for me. The integration test ran in thirty seconds and the token was good for fifteen minutes. The QR code was correct relative to the address the browser had loaded. Both bugs were invisible to the AI pair, to the test suite, and to me until I actually played the game in something resembling a real environment.

The honest takeaway, from someone who has now spent enough hours with this tool to have an opinion: an LLM pair is the fastest junior engineer you will ever work with. It will write the code. It will not tell you what to test, and it will not tell you when your test suite is lying to you about how the system behaves in the wild.

Three days to build the vertical slice. Two more days to make it survive a single bar. That ratio is the part I did not see coming, and it is the part the velocity numbers leave out.

#buildinpublic #engineeringleadership #ai
