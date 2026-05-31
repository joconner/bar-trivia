import * as path from 'path'
import * as dotenv from 'dotenv'

// Load the repo-root .env before anything else reads process.env. Path is
// resolved from this file so it works regardless of cwd (npm workspace scripts
// cwd into packages/server, while the Docker container starts from /app).
// In Docker, env vars are already injected via docker-compose env_file, so
// this call is a no-op; locally, it loads the developer's .env.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ZodValidationPipe } from 'nestjs-zod'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { isAllowedOrigin } from './cors-allowlist'
import { loadEnv } from './config/env.schema'

async function bootstrap() {
  loadEnv() // validates and exits on missing/malformed required vars

  const app = await NestFactory.create(AppModule)

  app.use(cookieParser())

  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (isAllowedOrigin(origin)) cb(null, true)
      else cb(new Error(`Origin ${origin} not allowed by CORS`), false)
    },
    credentials: true,
  })

  app.useGlobalPipes(new ZodValidationPipe())

  await app.listen(3000)
  console.log('Server running on http://localhost:3000')
}

bootstrap()
