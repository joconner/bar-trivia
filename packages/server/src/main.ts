import 'dotenv/config'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ZodValidationPipe } from 'nestjs-zod'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.use(cookieParser())

  app.enableCors({
    origin: process.env.CLIENT_ORIGINS?.split(',') ?? [],
    credentials: true,
  })

  app.useGlobalPipes(new ZodValidationPipe())

  await app.listen(3000)
  console.log('Server running on http://localhost:3000')
}

bootstrap()
