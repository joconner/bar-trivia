import { z } from 'zod'

export const QuestionTypeSchema = z.enum(['multiple_choice'])
export type QuestionType = z.infer<typeof QuestionTypeSchema>

export const ChoiceSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1).max(300),
})
export type Choice = z.infer<typeof ChoiceSchema>

export const MultipleChoiceDataSchema = z.object({
  type: z.literal('multiple_choice'),
  choices: z.array(ChoiceSchema).length(4),
  correctChoiceId: z.string().uuid(),
}).refine(
  (d) => d.choices.some((c) => c.id === d.correctChoiceId),
  { message: 'correctChoiceId must reference one of the provided choice ids', path: ['correctChoiceId'] },
)
export type MultipleChoiceData = z.infer<typeof MultipleChoiceDataSchema>

// Discriminated union on 'type' — add new variants here for new question types.
export const QuestionDataSchema = MultipleChoiceDataSchema
export type QuestionData = z.infer<typeof QuestionDataSchema>

// Pack / Game / Question ids are server-generated, server-stored, and never
// supplied by the wire. Most are uuids (from Prisma defaults) but seeded
// shared packs use stable derived ids like "house-pack-general-knowledge",
// so the schema accepts any non-empty string. Choice ids stay uuid-shaped
// because they're content-shape constraints the host UI relies on.
export const QuestionSchema = z.object({
  id: z.string().min(1),
  type: QuestionTypeSchema,
  prompt: z.string().min(1).max(1000),
  imageUrl: z.string().url().nullable(),
  data: QuestionDataSchema,
  defaultTimerSeconds: z.number().int().min(5).max(120).default(30),
  position: z.number().int().min(0),
})
export type Question = z.infer<typeof QuestionSchema>

export const GameSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(100),
  questions: z.array(QuestionSchema),
  lateJoinDefault: z.enum(['open', 'locked']).default('open'),
  tiebreakerMethod: z.enum(['response_time']),
  phoneTextMode: z.enum(['heads_up', 'full']).default('heads_up'),
})
export type Game = z.infer<typeof GameSchema>

export const PackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(100),
  ownerId: z.string().min(1),
  games: z.array(GameSchema),
})
export type Pack = z.infer<typeof PackSchema>
