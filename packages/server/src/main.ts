import 'dotenv/config'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ZodValidationPipe } from 'nestjs-zod'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { isAllowedOrigin } from './cors-allowlist'

async function bootstrap() {
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
