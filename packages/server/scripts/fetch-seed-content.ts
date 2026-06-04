// One-shot fetcher: pulls 500 questions from Open Trivia DB
// (https://opentdb.com — CC BY-SA 4.0) and writes them as
// packages/server/prisma/seed-content/shared-packs.json so the seed step has
// deterministic content without needing network access.
//
// Run from packages/server/ via `npx ts-node scripts/fetch-seed-content.ts`.
// Takes ~5-6 minutes because OpenTDB rate-limits to 1 request / 5 seconds.
//
// The output JSON is what `prisma/seed.ts` reads to create the house user's
// shared packs. Re-run this script only when you want to refresh the seed
// content; the committed JSON is the source of truth otherwise.

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

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

interface SeededQuestion {
  prompt: string
  data: {
    type: 'multiple_choice'
    choices: Array<{ id: string; text: string }>
    correctChoiceId: string
  }
}

interface SeededGame {
  title: string
  questions: SeededQuestion[]
}

interface SeededPack {
  title: string
  description: string
  attribution: string
  games: SeededGame[]
}

// Themed packs. Each pack: 5 games of 20 questions = 100 questions.
// Each game: 8 easy + 8 medium + 4 hard.
//
// Pop Culture rotates across film/music/tv/celebrities to feel like the genre
// rather than just movies. The single-category themes use one OpenTDB category.
interface ThemeSpec {
  title: string
  description: string
  categories: number[] // multiple = rotate per request batch
}

const THEMES: ThemeSpec[] = [
  {
    title: 'General Knowledge',
    description: 'A broad mix of trivia to warm up the room.',
    categories: [9],
  },
  {
    title: 'History',
    description: 'From ancient civilizations to twentieth-century turning points.',
    categories: [23],
  },
  {
    title: 'Science',
    description: 'Biology, chemistry, physics, and the natural world.',
    categories: [17],
  },
  {
    title: 'Pop Culture',
    description: 'Film, music, television, and the celebrities who fill them.',
    categories: [11, 12, 14, 26], // film, music, tv, celebrities
  },
  {
    title: 'Sports',
    description: 'Games, leagues, athletes, and the moments that defined them.',
    categories: [21],
  },
]

const GAMES_PER_PACK = 5
const EASY_PER_GAME = 8
const MEDIUM_PER_GAME = 8
const HARD_PER_GAME = 4
const QUESTIONS_PER_GAME = EASY_PER_GAME + MEDIUM_PER_GAME + HARD_PER_GAME

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function fetchBatch(
  amount: number,
  difficulty: 'easy' | 'medium' | 'hard',
  category: number,
): Promise<OpenTdbResponse['results']> {
  const params = new URLSearchParams({
    amount: String(amount),
    type: 'multiple',
    encode: 'url3986',
    difficulty,
    category: String(category),
  })
  const url = `https://opentdb.com/api.php?${params}`

  // Retry on 429 (rate-limit) and on response_code=5 (also a rate-limit signal).
  // OpenTDB enforces 1 request / 5s per IP; we sleep 5.5s between requests but
  // a cold start or transient hiccup can still tickle the limiter.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url)
    if (res.status === 429) {
      const backoff = 6000 * attempt
      console.warn(`    429 from OpenTDB, retrying in ${backoff / 1000}s (attempt ${attempt}/5)`)
      await sleep(backoff)
      continue
    }
    if (!res.ok) throw new Error(`OpenTDB HTTP ${res.status} for ${url}`)
    const body = (await res.json()) as OpenTdbResponse
    if (body.response_code === 5) {
      const backoff = 6000 * attempt
      console.warn(`    response_code=5 (rate-limit), retrying in ${backoff / 1000}s (attempt ${attempt}/5)`)
      await sleep(backoff)
      continue
    }
    if (body.response_code !== 0) {
      throw new Error(`OpenTDB response_code=${body.response_code} for difficulty=${difficulty} category=${category}`)
    }
    return body.results
  }
  throw new Error(`OpenTDB exhausted retries for ${url}`)
}

async function fetchForTheme(theme: ThemeSpec): Promise<{ easy: OpenTdbResponse['results']; medium: OpenTdbResponse['results']; hard: OpenTdbResponse['results'] }> {
  const easyPerCat = Math.ceil((EASY_PER_GAME * GAMES_PER_PACK) / theme.categories.length)
  const mediumPerCat = Math.ceil((MEDIUM_PER_GAME * GAMES_PER_PACK) / theme.categories.length)
  const hardPerCat = Math.ceil((HARD_PER_GAME * GAMES_PER_PACK) / theme.categories.length)

  const easy: OpenTdbResponse['results'] = []
  const medium: OpenTdbResponse['results'] = []
  const hard: OpenTdbResponse['results'] = []

  let firstRequest = true
  for (const cat of theme.categories) {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const target = difficulty === 'easy' ? easyPerCat : difficulty === 'medium' ? mediumPerCat : hardPerCat
      const sink = difficulty === 'easy' ? easy : difficulty === 'medium' ? medium : hard
      if (!firstRequest) await sleep(5500)
      firstRequest = false
      const batch = await fetchBatch(Math.min(50, target), difficulty, cat)
      sink.push(...batch)
      console.log(`    cat=${cat} ${difficulty}: +${batch.length} (total for difficulty: ${sink.length})`)
    }
  }

  // Trim to exact counts in case categories supplied more than needed.
  return {
    easy: easy.slice(0, EASY_PER_GAME * GAMES_PER_PACK),
    medium: medium.slice(0, MEDIUM_PER_GAME * GAMES_PER_PACK),
    hard: hard.slice(0, HARD_PER_GAME * GAMES_PER_PACK),
  }
}

function buildQuestion(raw: OpenTdbResponse['results'][number]): SeededQuestion {
  const prompt = decodeURIComponent(raw.question)
  const correctText = decodeURIComponent(raw.correct_answer)
  const incorrectTexts = raw.incorrect_answers.map(decodeURIComponent)

  const choices = [correctText, ...incorrectTexts].map((text) => ({ id: randomUUID(), text }))
  // Fisher-Yates so the correct answer isn't always at position 0.
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
  console.log(`Fetching seed content from OpenTDB (5 themes x ${GAMES_PER_PACK} games x ${QUESTIONS_PER_GAME} questions = ${5 * GAMES_PER_PACK * QUESTIONS_PER_GAME} questions total).`)
  console.log('OpenTDB rate-limits to 1 request / 5s; this will take several minutes.\n')

  const packs: SeededPack[] = []

  let firstTheme = true
  for (const theme of THEMES) {
    if (!firstTheme) await sleep(5500) // honor rate limit across theme transitions
    firstTheme = false
    console.log(`  Theme: ${theme.title}`)
    const { easy, medium, hard } = await fetchForTheme(theme)

    if (easy.length < EASY_PER_GAME * GAMES_PER_PACK)
      throw new Error(`${theme.title}: got ${easy.length} easy, need ${EASY_PER_GAME * GAMES_PER_PACK}`)
    if (medium.length < MEDIUM_PER_GAME * GAMES_PER_PACK)
      throw new Error(`${theme.title}: got ${medium.length} medium, need ${MEDIUM_PER_GAME * GAMES_PER_PACK}`)
    if (hard.length < HARD_PER_GAME * GAMES_PER_PACK)
      throw new Error(`${theme.title}: got ${hard.length} hard, need ${HARD_PER_GAME * GAMES_PER_PACK}`)

    const games: SeededGame[] = []
    for (let g = 0; g < GAMES_PER_PACK; g++) {
      const easySlice = easy.slice(g * EASY_PER_GAME, (g + 1) * EASY_PER_GAME)
      const mediumSlice = medium.slice(g * MEDIUM_PER_GAME, (g + 1) * MEDIUM_PER_GAME)
      const hardSlice = hard.slice(g * HARD_PER_GAME, (g + 1) * HARD_PER_GAME)
      const orderedRaw = [...easySlice, ...mediumSlice, ...hardSlice]
      games.push({
        title: `${theme.title} — Round ${g + 1}`,
        questions: orderedRaw.map(buildQuestion),
      })
    }

    packs.push({
      title: theme.title,
      description: theme.description,
      attribution: 'Questions from the Open Trivia Database (https://opentdb.com), CC BY-SA 4.0.',
      games,
    })

    console.log(`    ${theme.title}: built ${games.length} games / ${games.reduce((n, g) => n + g.questions.length, 0)} questions\n`)
  }

  // ts-node compiles to CommonJS so __dirname is available natively.
  const outDir = join(__dirname, '..', 'prisma', 'seed-content')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'shared-packs.json')
  writeFileSync(outPath, JSON.stringify(packs, null, 2) + '\n')

  console.log(`Wrote ${packs.length} packs / ${packs.reduce((n, p) => n + p.games.length, 0)} games / ${packs.reduce((n, p) => n + p.games.reduce((m, g) => m + g.questions.length, 0), 0)} questions`)
  console.log(`to ${outPath}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
