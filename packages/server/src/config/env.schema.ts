import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
  // Stripe keys — required in production, optional in dev (billing routes return 503 if absent)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_MONTHLY_PRICE_ID: z.string().optional(),
  // Trial duration in days for new host accounts
  STRIPE_TRIAL_DAYS: z.coerce.number().default(14),
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    console.error(`Invalid environment configuration:\n${issues}`)
    process.exit(1)
  }
  return result.data
}
