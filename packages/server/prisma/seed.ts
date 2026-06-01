// Database seed. Creates the synthetic "house" user and loads the bundled
// shared packs (sourced from Open Trivia Database, CC BY-SA 4.0) so every
// host's pack-library is non-empty out of the box.
//
// Idempotent: safe to run repeatedly. Re-running the seed:
//   - leaves the house user alone if it already exists
//   - upserts packs and games by stable id
//   - upserts questions by stable id (id derived from pack + game + position)
//
// The actual content lives in seed-content/shared-packs.json — regenerate
// with `npx ts-node scripts/fetch-seed-content.ts`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { HOUSE_USER_ID } from '@bar-trivia/shared'

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

// Deterministic ids derived from titles, so reseeding the same JSON doesn't
// create duplicates or drift the ids around. `slug` is lowercase, alnum, dashes.
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
function packId(pack: SeededPack): string {
  return `house-pack-${slug(pack.title)}`
}
function gameId(pack: SeededPack, gameIndex: number): string {
  return `${packId(pack)}-game-${gameIndex + 1}`
}
function questionId(pack: SeededPack, gameIndex: number, questionIndex: number): string {
  return `${gameId(pack, gameIndex)}-q${questionIndex + 1}`
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    const houseUser = await prisma.user.upsert({
      where: { id: HOUSE_USER_ID },
      update: {},
      create: {
        id: HOUSE_USER_ID,
        role: 'admin',
        displayName: 'Bar Trivia',
        email: 'house@bar-trivia.local',
      },
    })

    const contentPath = join(__dirname, 'seed-content', 'shared-packs.json')
    const packs = JSON.parse(readFileSync(contentPath, 'utf8')) as SeededPack[]

    for (const pack of packs) {
      const pid = packId(pack)
      await prisma.pack.upsert({
        where: { id: pid },
        update: { title: pack.title },
        create: {
          id: pid,
          title: pack.title,
          ownerId: houseUser.id,
        },
      })

      for (let g = 0; g < pack.games.length; g++) {
        const game = pack.games[g]
        const gid = gameId(pack, g)
        await prisma.game.upsert({
          where: { id: gid },
          update: { title: game.title, position: g },
          create: {
            id: gid,
            packId: pid,
            title: game.title,
            position: g,
          },
        })

        for (let q = 0; q < game.questions.length; q++) {
          const question = game.questions[q]
          const qid = questionId(pack, g, q)
          await prisma.question.upsert({
            where: { id: qid },
            update: {
              prompt: question.prompt,
              data: question.data,
              position: q,
            },
            create: {
              id: qid,
              gameId: gid,
              type: 'multiple_choice',
              prompt: question.prompt,
              data: question.data,
              position: q,
            },
          })
        }
      }

      console.log(`  Pack "${pack.title}": ${pack.games.length} games, ${pack.games.reduce((n, g) => n + g.questions.length, 0)} questions`)
    }

    const totalQuestions = packs.reduce((n, p) => n + p.games.reduce((m, g) => m + g.questions.length, 0), 0)
    console.log(`\nSeed complete: ${packs.length} shared packs, ${packs.reduce((n, p) => n + p.games.length, 0)} games, ${totalQuestions} questions owned by ${HOUSE_USER_ID}.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
