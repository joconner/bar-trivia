import 'dotenv/config'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ZodValidationPipe } from 'nestjs-zod'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.use(cookieParser())

  const allowedOrigins = process.env.CLIENT_ORIGINS?.split(',').filter(Boolean) ?? []
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  })

  app.useGlobalPipes(new ZodValidationPipe())

  await app.listen(3000)
  console.log('Server running on http://localhost:3000')
}

bootstrap()
