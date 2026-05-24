/**
 * Family scenario integration test
 *
 * Story: Family gathers in the living room. Mom signs in as host and prepares
 * a room. 3 children and father sign in as players. Host begins the game and
 * leads the game to completion.
 *
 * This tests registered player accounts (not guest flow) joining and playing
 * through a complete game as a family unit.
 *
 * Prerequisites:
 *   SERVER_URL env var must be set (or defaults to http://localhost:3000).
 *   The server must already be running.
 *
 * Usage:
 *   SERVER_URL=http://localhost:3000 node packages/server/test/family-scenario.mjs
 */

import { io } from 'socket.io-client'
import { randomUUID } from 'crypto'

const BASE = process.env.SERVER_URL ?? 'http://localhost:3000'
const WAIT_MS = parseInt(process.env.WAIT_MS ?? '400', 10)

// Build multiple-choice question data with UUID choice IDs
function mc(choiceTexts, correctIndex = 0) {
  const ids = choiceTexts.map(() => randomUUID())
  return {
    type: 'multiple_choice',
    choices: choiceTexts.map((text, i) => ({ id: ids[i], text })),
    correctChoiceId: ids[correctIndex],
    _ids: ids,
  }
}

// ─── test harness ────────────────────────────────────────────────────────────

let stepNum = 0
let passed = 0
let failed = 0
const errors = []

function log(msg) {
  process.stdout.write(`  ${msg}\n`)
}

function step(title) {
  stepNum++
  process.stdout.write(`\nStep ${stepNum}: ${title}\n`)
}

function assert(condition, label) {
  if (condition) {
    log(`  ✓ ${label}`)
    passed++
  } else {
    log(`  ✗ ${label}`)
    failed++
    errors.push(`Step ${stepNum}: ${label}`)
  }
}

async function api(method, path, { token, body, cookieJar } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (cookieJar?.cookie) headers['Cookie'] = cookieJar.cookie

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (cookieJar !== undefined) {
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      const match = setCookie.match(/^([^;]+)/)
      if (match) cookieJar.cookie = match[1]
    }
  }

  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }

  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`)
  }
  return json
}

function connectSocket({ token, roomCode } = {}) {
  const socket = io(BASE, {
    auth: token ? { token } : {},
    query: roomCode ? { roomCode } : {},
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Origin: 'http://localhost:5173' },
  })
  socket._latestState = null
  socket.on('room:state', (state) => { socket._latestState = state })
  return socket
}

function waitForState(socket, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (socket._latestState && predicate(socket._latestState)) {
      resolve(socket._latestState)
      return
    }
    const t = setTimeout(() => reject(new Error('waitForState timeout')), timeoutMs)
    function handler(state) {
      if (predicate(state)) {
        clearTimeout(t)
        socket.off('room:state', handler)
        resolve(state)
      }
    }
    socket.on('room:state', handler)
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Register or log in a user, returning { token, cookieJar }
async function loginOrRegister(email, password, displayName, role = 'host') {
  const jar = {}
  try {
    const res = await api('POST', '/auth/register', {
      body: { email, password, displayName },
      cookieJar: jar,
    })
    return { token: res.accessToken, cookieJar: jar }
  } catch {
    const res = await api('POST', '/auth/login', {
      body: { email, password },
      cookieJar: jar,
    })
    return { token: res.accessToken, cookieJar: jar }
  }
}

// ─── scenario ────────────────────────────────────────────────────────────────

const SUFFIX = randomUUID().slice(0, 8) // unique per run so re-runs don't conflict

const FAMILY = {
  mom:   { email: `mom-${SUFFIX}@family.test`,   password: 'FamilyPass1!', displayName: 'Mom' },
  dad:   { email: `dad-${SUFFIX}@family.test`,   password: 'FamilyPass1!', displayName: 'Dad' },
  child1:{ email: `alice-${SUFFIX}@family.test`, password: 'FamilyPass1!', displayName: 'Alice' },
  child2:{ email: `bob-${SUFFIX}@family.test`,   password: 'FamilyPass1!', displayName: 'Bob' },
  child3:{ email: `carol-${SUFFIX}@family.test`, password: 'FamilyPass1!', displayName: 'Carol' },
}

async function run() {
  console.log(`\n=== Family Scenario Integration Test ===`)
  console.log(`Server: ${BASE}\n`)

  // ── Step 1: Mom registers as host ──────────────────────────────────────────
  step('Mom signs in as host')

  let momToken, momJar
  try {
    const res = await loginOrRegister(FAMILY.mom.email, FAMILY.mom.password, FAMILY.mom.displayName)
    momToken = res.token
    momJar = res.cookieJar
    assert(typeof momToken === 'string', 'Mom received access token')
  } catch (e) {
    assert(false, `Mom auth failed: ${e.message}`)
    return summarize()
  }

  // ── Step 2: Mom creates pack + game + questions ────────────────────────────
  step('Mom prepares trivia pack with 3 questions')

  const pack = await api('POST', '/packs', { token: momToken, body: { title: 'Family Trivia Night' } })
  assert(pack.title === 'Family Trivia Night', 'Pack created')

  const game = await api('POST', `/packs/${pack.id}/games`, {
    token: momToken,
    body: { title: 'Round 1', phoneTextMode: 'heads_up', lateJoinDefault: 'open' },
  })
  assert(typeof game.id === 'string', 'Game created inside pack')

  const q1data = mc(['Simba', 'Nemo', 'Dumbo', 'Bambi'], 0)
  const q2data = mc(['New York', 'London', 'Paris', 'Tokyo'], 2)
  const q3data = mc(['8', '9', '7', '6'], 0)

  const questionDefs = [
    { prompt: 'What is the name of the lion cub in The Lion King?', data: { type: q1data.type, choices: q1data.choices, correctChoiceId: q1data.correctChoiceId }, defaultTimerSeconds: 10 },
    { prompt: 'What is the capital of France?', data: { type: q2data.type, choices: q2data.choices, correctChoiceId: q2data.correctChoiceId }, defaultTimerSeconds: 10 },
    { prompt: 'How many planets are in our solar system?', data: { type: q3data.type, choices: q3data.choices, correctChoiceId: q3data.correctChoiceId }, defaultTimerSeconds: 10 },
  ]

  const questionIds = []
  for (const q of questionDefs) {
    const created = await api('POST', `/packs/${pack.id}/games/${game.id}/questions`, {
      token: momToken,
      body: q,
    })
    questionIds.push(created.id)
  }
  assert(questionIds.length === 3, '3 questions created')

  // ── Step 3: Mom creates the room ───────────────────────────────────────────
  step('Mom creates room and gets room code')

  const { roomCode, joinUrl } = await api('POST', '/rooms', {
    token: momToken,
    body: { packId: pack.id, gameId: game.id },
  })
  assert(typeof roomCode === 'string' && roomCode.length === 4, `Room code issued: ${roomCode}`)
  assert(joinUrl.includes(roomCode), 'Join URL contains room code')

  // ── Step 4: TV observer connects ──────────────────────────────────────────
  step('TV display connects to room')

  const tvSocket = connectSocket({ roomCode })
  const tvLobby = await waitForState(tvSocket, (s) => s.phase === 'lobby')
  assert(tvLobby.roomCode === roomCode, 'TV sees lobby with correct room code')

  // ── Step 5: 3 children and father register and join as players ─────────────
  step('Dad and 3 children register as players and join the room')

  const players = []
  for (const member of [FAMILY.dad, FAMILY.child1, FAMILY.child2, FAMILY.child3]) {
    // Register as a player account
    const authRes = await loginOrRegister(member.email, member.password, member.displayName)

    // Join the room with their player token
    const joinJar = {}
    const joinRes = await api('POST', `/rooms/${roomCode}/join`, {
      token: authRes.token,
      cookieJar: joinJar,
    })
    assert(typeof joinRes.accessToken === 'string', `${member.displayName} joined room`)
    assert(typeof joinRes.participant.id === 'string', `${member.displayName} has participant ID`)
    assert(joinRes.participant.displayName === member.displayName, `${member.displayName} display name preserved (got: ${joinRes.participant.displayName})`)
    players.push({
      name: member.displayName,
      token: joinRes.accessToken,
      participantId: joinRes.participant.id,
      displayName: joinRes.participant.displayName,
      cookieJar: joinJar,
    })
  }

  // Connect player sockets
  const playerSockets = []
  for (const p of players) {
    const s = connectSocket({ token: p.token })
    await waitForState(s, (s) => s.phase === 'lobby')
    playerSockets.push(s)
  }

  // Mom connects as host (needs roomCode query param)
  const momSocket = connectSocket({ token: momToken, roomCode })
  const momLobby = await waitForState(momSocket, (s) => s.phase === 'lobby' && s.players.length === 4)
  assert(momLobby.players.length === 4, 'Host sees all 4 players in lobby')
  log(`  → Players in lobby: ${momLobby.players.map((p) => p.displayName).join(', ')}`)

  await sleep(WAIT_MS)

  // ── Step 6: Mom starts the game ────────────────────────────────────────────
  step('Mom starts the game')

  const startRes = await api('POST', `/rooms/${roomCode}/game/start`, { token: momToken })
  assert(startRes.phase === 'question', 'Game started - phase is question')
  assert(startRes.currentQuestionIndex === 0, 'First question active')

  // ── Step 7: Q1 - all 4 players answer ─────────────────────────────────────
  step('Q1: All 4 players answer (Dad + Alice correct, Bob + Carol wrong)')

  const q1State = await waitForState(tvSocket, (s) => s.phase === 'question' && s.currentQuestionIndex === 0)
  assert(q1State.phase === 'question', 'TV sees Q1')
  const q1Id = q1State.currentQuestion.questionId

  // Dad and Alice answer correctly, Bob and Carol answer wrong
  await api('POST', `/rooms/${roomCode}/answers`, { token: players[0].token, body: { questionId: q1Id, choiceId: q1data.correctChoiceId } })
  assert(true, 'Dad submitted answer')
  await api('POST', `/rooms/${roomCode}/answers`, { token: players[1].token, body: { questionId: q1Id, choiceId: q1data.correctChoiceId } })
  assert(true, 'Alice submitted answer')
  await api('POST', `/rooms/${roomCode}/answers`, { token: players[2].token, body: { questionId: q1Id, choiceId: q1data._ids[1] } })
  assert(true, 'Bob submitted answer')
  await api('POST', `/rooms/${roomCode}/answers`, { token: players[3].token, body: { questionId: q1Id, choiceId: q1data._ids[2] } })
  assert(true, 'Carol submitted answer')

  // Verify double-submit rejected for one player
  try {
    await api('POST', `/rooms/${roomCode}/answers`, { token: players[0].token, body: { questionId: q1Id, choiceId: q1data._ids[1] } })
    assert(false, 'Double-submit should be rejected')
  } catch (e) {
    assert(e.message.includes('409') || e.message.toLowerCase().includes('already'), 'Double-submit correctly rejected')
  }

  // Wait for timer to expire and reveal
  const q1Reveal = await waitForState(tvSocket, (s) => s.phase === 'reveal' && s.currentQuestionIndex === 0, 15000)
  assert(q1Reveal.phase === 'reveal', 'Q1 reveal shown after timer')
  assert(q1Reveal.currentQuestion.correctChoiceId === q1data.correctChoiceId, 'Correct answer in reveal')
  const breakdown1 = q1Reveal.currentQuestion.answerBreakdown
  assert((breakdown1[q1data.correctChoiceId] ?? 0) === 2, 'Q1 breakdown: 2 correct answers')
  log(`  → Q1 scores: ${q1Reveal.leaderboard.map((e) => `${e.displayName}:${e.score}`).join(', ')}`)

  await sleep(WAIT_MS)

  // ── Step 8: Q2 - Mom advances, all answer ─────────────────────────────────
  step('Q2: Mom advances, all players answer')

  await api('POST', `/rooms/${roomCode}/game/advance`, { token: momToken })
  const q2State = await waitForState(tvSocket, (s) => s.phase === 'question' && s.currentQuestionIndex === 1)
  assert(q2State.phase === 'question', 'TV sees Q2')
  const q2Id = q2State.currentQuestion.questionId

  // Everyone answers Q2 (Paris is capital of France - all get it right)
  for (const p of players) {
    await api('POST', `/rooms/${roomCode}/answers`, { token: p.token, body: { questionId: q2Id, choiceId: q2data.correctChoiceId } })
  }
  assert(true, 'All 4 players answered Q2')

  // Mom advances to reveal early
  await sleep(200)
  await api('POST', `/rooms/${roomCode}/game/advance`, { token: momToken })
  const q2Reveal = await waitForState(tvSocket, (s) => s.phase === 'reveal' && s.currentQuestionIndex === 1)
  assert(q2Reveal.phase === 'reveal', 'Q2 reveal shown (host advanced early)')
  const breakdown2 = q2Reveal.currentQuestion.answerBreakdown
  assert((breakdown2[q2data.correctChoiceId] ?? 0) === 4, 'All 4 players got Q2 correct')
  log(`  → Q2 scores: ${q2Reveal.leaderboard.map((e) => `${e.displayName}:${e.score}`).join(', ')}`)

  await sleep(WAIT_MS)

  // ── Step 9: Q3 - final question ────────────────────────────────────────────
  step('Q3: Final question, all players answer')

  await api('POST', `/rooms/${roomCode}/game/advance`, { token: momToken })
  const q3State = await waitForState(tvSocket, (s) => s.phase === 'question' && s.currentQuestionIndex === 2)
  assert(q3State.phase === 'question', 'TV sees Q3')
  const q3Id = q3State.currentQuestion.questionId

  // Dad and Bob answer correctly (8 planets), Alice and Carol wrong
  await api('POST', `/rooms/${roomCode}/answers`, { token: players[0].token, body: { questionId: q3Id, choiceId: q3data.correctChoiceId } })
  await api('POST', `/rooms/${roomCode}/answers`, { token: players[1].token, body: { questionId: q3Id, choiceId: q3data._ids[2] } })
  await api('POST', `/rooms/${roomCode}/answers`, { token: players[2].token, body: { questionId: q3Id, choiceId: q3data.correctChoiceId } })
  await api('POST', `/rooms/${roomCode}/answers`, { token: players[3].token, body: { questionId: q3Id, choiceId: q3data._ids[3] } })
  assert(true, 'All 4 players answered Q3')

  await api('POST', `/rooms/${roomCode}/game/advance`, { token: momToken })
  const q3Reveal = await waitForState(tvSocket, (s) => s.phase === 'reveal' && s.currentQuestionIndex === 2)
  assert(q3Reveal.phase === 'reveal', 'Q3 reveal shown')

  await sleep(WAIT_MS)

  // ── Step 10: Mom advances to final ────────────────────────────────────────
  step('Mom advances to final leaderboard')

  await api('POST', `/rooms/${roomCode}/game/advance`, { token: momToken })
  const finalState = await waitForState(tvSocket, (s) => s.phase === 'final', 8000)
  assert(finalState.phase === 'final', 'Game reached final state')
  assert(Array.isArray(finalState.finalPodium), 'Final podium present')
  assert(finalState.leaderboard.length === 4, '4 players in final leaderboard')
  assert(finalState.finalPodium.length >= 1, 'Podium has entries')

  // Verify expected scores:
  // Dad:   Q1✓(1) Q2✓(1) Q3✓(1) = 3
  // Alice: Q1✓(1) Q2✓(1) Q3✗(0) = 2
  // Bob:   Q1✗(0) Q2✓(1) Q3✓(1) = 2
  // Carol: Q1✗(0) Q2✓(1) Q3✗(0) = 1
  const lb = finalState.leaderboard
  const dadEntry = lb.find((e) => e.participantId === players[0].participantId)
  const carolEntry = lb.find((e) => e.participantId === players[3].participantId)
  assert(dadEntry !== undefined, 'Dad present in final leaderboard')
  assert(dadEntry?.score === 3, `Dad has 3 points (got ${dadEntry?.score})`)
  assert(carolEntry !== undefined, 'Carol present in final leaderboard')
  assert(carolEntry?.score === 1, `Carol has 1 point (got ${carolEntry?.score})`)
  assert(lb[0].rank === 1, 'Top player has rank 1')
  assert(lb[lb.length - 1].rank === lb.length || lb[lb.length - 1].rank >= 3, 'Last player ranked correctly')

  log(`  → Final leaderboard:`)
  lb.forEach((e) => log(`      #${e.rank} ${e.displayName}: ${e.score} pts`))
  log(`  → Podium: ${finalState.finalPodium.map((e) => `#${e.rank} ${e.displayName}`).join(', ')}`)

  // ── Step 11: Disconnect ────────────────────────────────────────────────────
  step('Family session ends - all disconnect')

  tvSocket.disconnect()
  momSocket.disconnect()
  for (const s of playerSockets) s.disconnect()
  assert(true, 'All sockets disconnected cleanly')

  // ── Step 12: Verify room in final state via REST ───────────────────────────
  step('Verify room in final state via REST')

  const roomState = await api('GET', `/rooms/${roomCode}`)
  assert(roomState.phase === 'final', 'Room is in final state after session')

  return summarize()
}

function summarize() {
  console.log('\n' + '─'.repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\nFailed assertions:')
    errors.forEach((e) => console.log(`  - ${e}`))
  }
  console.log('─'.repeat(60) + '\n')
  return { passed, failed, errors }
}

run()
  .then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0)
  })
  .catch((err) => {
    console.error('\nFATAL ERROR:', err.message)
    if (err.stack) console.error(err.stack)
    process.exit(1)
  })
