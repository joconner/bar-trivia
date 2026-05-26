// Seed-pack tool: pulls real multiple-choice questions from Open Trivia DB
// (https://opentdb.com/api.php — free, no key) and writes a Pack of N games
// to the running Postgres, owned by an existing host user.
//
// Usage:
//   npm run seed:pack -- --owner demo@host.local --pack "Friday Night" \
//                        --games 3 --questions 20 [--category 9] [--difficulty medium]
//
// Required: --owner <email>
// Defaults: --pack "Trivia Pack"  --games 1  --questions 10  --difficulty medium
//
// Question count per game must be 10 or 20 (matches v0 cut-list).
//
// OpenTDB constraints we respect:
//   - max 50 questions per call → batch when total > 50
//   - rate limit ~1 req / 5s → throttle 5.5s between calls
//   - encode=url3986 → clean URL-encoded text, decoded once on receive

import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { PrismaClient, Prisma } from '@prisma/client'

interface Args {
  owner: string
  pack: string
  games: number
  questions: 10 | 20
  category?: number
  difficulty: 'easy' | 'medium' | 'hard'
}

interface OpenTdbResponse {
  response_code: number
  results: Array<{
    category: string
    type: 'multiple'
    difficulty: string
    question: string
    correct_answer: string
    incorrect_answers: [string, string, string]
  }>
}

const OPENTDB_RESPONSE_CODE_MEANING: Record<number, string> = {
  0: 'Success',
  1: 'No Results — not enough questions for the requested filter',
  2: 'Invalid Parameter',
  3: 'Token Not Found',
  4: 'Token Empty — all questions exhausted for this token',
  5: 'Rate Limit — slow down (1 req / 5s)',
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { pack: 'Trivia Pack', games: 1, questions: 10, difficulty: 'medium' }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const val = argv[i + 1]
    switch (flag) {
      case '--owner': out.owner = val; i++; break
      case '--pack': out.pack = val; i++; break
      case '--games': out.games = Number(val); i++; break
      case '--questions': out.questions = Number(val) as 10 | 20; i++; break
      case '--category': out.category = Number(val); i++; break
      case '--difficulty': out.difficulty = val as Args['difficulty']; i++; break
      case '--help':
      case '-h':
        printUsage()
        process.exit(0)
    }
  }
  if (!out.owner) fail('--owner <email> is required')
  if (![10, 20].includes(out.questions!)) fail('--questions must be 10 or 20')
  if (!out.games || out.games < 1) fail('--games must be >= 1')
  if (!['easy', 'medium', 'hard'].includes(out.difficulty!)) fail('--difficulty must be easy|medium|hard')
  return out as Args
}

function printUsage(): void {
  console.log(`Usage: npm run seed:pack -- --owner <email> [options]

Options:
  --owner <email>         (required) email of existing host user
  --pack <title>          pack title (default: "Trivia Pack")
  --games <n>             games to create (default: 1)
  --questions <10|20>     questions per game (default: 10)
  --category <id>         OpenTDB category id (default: random per game)
  --difficulty <level>    easy | medium | hard (default: medium)`)
}

function fail(msg: string): never {
  console.error(`error: ${msg}`)
  printUsage()
  process.exit(1)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function fetchQuestions(count: number, difficulty: string, category?: number): Promise<OpenTdbResponse['results']> {
  const collected: OpenTdbResponse['results'] = []
  let remaining = count
  let firstCall = true
  while (remaining > 0) {
    if (!firstCall) await sleep(5500)
    firstCall = false
    const batch = Math.min(50, remaining)
    const params = new URLSearchParams({
      amount: String(batch),
      type: 'multiple',
      encode: 'url3986',
      difficulty,
    })
    if (category !== undefined) params.set('category', String(category))
    const url = `https://opentdb.com/api.php?${params}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`OpenTDB HTTP ${res.status}`)
    const body = (await res.json()) as OpenTdbResponse
    if (body.response_code !== 0) {
      const meaning = OPENTDB_RESPONSE_CODE_MEANING[body.response_code] ?? 'unknown'
      throw new Error(`OpenTDB response_code=${body.response_code} (${meaning})`)
    }
    collected.push(...body.results)
    remaining -= body.results.length
  }
  return collected
}

function buildQuestionData(raw: OpenTdbResponse['results'][number]): { prompt: string; data: Prisma.InputJsonValue } {
  const prompt = decodeURIComponent(raw.question)
  const correctText = decodeURIComponent(raw.correct_answer)
  const incorrectTexts = raw.incorrect_answers.map(decodeURIComponent)

  const choices = [correctText, ...incorrectTexts].map((text) => ({ id: randomUUID(), text }))
  // Fisher-Yates so correct isn't always position 0
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[choices[i], choices[j]] = [choices[j], choices[i]]
  }
  const correctChoiceId = choices.find((c) => c.text === correctText)!.id

  return {
    prompt,
    data: { type: 'multiple_choice', choices, correctChoiceId },
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const prisma = new PrismaClient()

  try {
    const owner = await prisma.user.findUnique({ where: { email: args.owner.trim().toLowerCase() } })
    if (!owner) fail(`no user found with email ${args.owner}`)
    if (owner.role !== 'host') fail(`user ${args.owner} has role ${owner.role}, must be host`)

    const totalQuestions = args.games * args.questions
    console.log(`Seeding pack "${args.pack}" for ${owner.email}: ${args.games} game(s) × ${args.questions} questions = ${totalQuestions} total`)
    console.log(`Fetching from OpenTDB (difficulty=${args.difficulty}${args.category ? `, category=${args.category}` : ''})...`)

    const raw = await fetchQuestions(totalQuestions, args.difficulty, args.category)
    if (raw.length < totalQuestions) {
      fail(`OpenTDB returned only ${raw.length} of ${totalQuestions} requested — try a different category/difficulty`)
    }

    const pack = await prisma.pack.create({
      data: {
        id: randomUUID(),
        title: args.pack,
        ownerId: owner.id,
        updatedAt: new Date(),
      },
    })

    for (let g = 0; g < args.games; g++) {
      const gameId = randomUUID()
      await prisma.game.create({
        data: {
          id: gameId,
          packId: pack.id,
          title: `${args.pack} — Game ${g + 1}`,
          position: g,
        },
      })

      const slice = raw.slice(g * args.questions, (g + 1) * args.questions)
      await prisma.question.createMany({
        data: slice.map((r, i) => {
          const { prompt, data } = buildQuestionData(r)
          return {
            id: randomUUID(),
            gameId,
            type: 'multiple_choice',
            prompt,
            data,
            position: i,
          }
        }),
      })
      console.log(`  Game ${g + 1}/${args.games}: ${slice.length} questions written`)
    }

    console.log(`\nDone. Pack id: ${pack.id}. Owner: ${owner.email}. Open the host UI to start a room.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
