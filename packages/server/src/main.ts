import * as path from 'path'
import * as dotenv from 'dotenv'
import { existsSync } from 'fs'

// Load the repo-root .env before anything else reads process.env. Path is
// resolved from this file so it works regardless of cwd (npm workspace scripts
// cwd into packages/server, while the Docker container starts from /app).
// In Docker, env vars are already injected via docker-compose env_file, so
// this call is a no-op; locally, it loads the developer's .env.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import 'reflect-metadata'
import * as express from 'express'
import { NestFactory } from '@nestjs/core'
import { ZodValidationPipe } from 'nestjs-zod'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { isAllowedOrigin } from './cors-allowlist'
import { loadEnv } from './config/env.schema'

async function bootstrap() {
  loadEnv() // validates and exits on missing/malformed required vars

  // rawBody: true preserves the raw request buffer so Stripe webhook signature
  // verification can run on the exact bytes that were signed.
  const app = await NestFactory.create(AppModule, { rawBody: true })

  app.use(cookieParser())

  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (isAllowedOrigin(origin)) cb(null, true)
      else cb(new Error(`Origin ${origin} not allowed by CORS`), false)
    },
    credentials: true,
  })

  app.useGlobalPipes(new ZodValidationPipe())

  // Serve the three React SPAs when their dist/ dirs exist (after `npm run build`
  // or on Render). In the Docker Compose stack, nginx handles these paths before
  // requests reach this server, so this code is inert in that context.
  //
  // Path layout: __dirname is packages/server/src/, so ../../ is packages/.
  const packagesDir = path.resolve(__dirname, '../..')
  for (const client of ['tv', 'host', 'player'] as const) {
    const distPath = path.join(packagesDir, client, 'dist')
    if (!existsSync(distPath)) continue
    app.use(`/${client}`, express.static(distPath))
    // SPA fallback: unmatched paths (e.g. /tv/ROOMCODE) serve index.html so
    // React Router can rehydrate the correct view after a hard refresh.
    app.use(`/${client}`, (_req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  // Redirect bare / to /tv/ — mirrors the nginx `location = /` rule so bar
  // staff typing just the IP into a TV browser land on the TV display.
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path === '/') res.redirect(302, '/tv/')
    else next()
  })

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
  await app.listen(port)
  console.log(`Server running on http://localhost:${port}`)
}

bootstrap()
