import { Module } from '@nestjs/common'
import { WinstonModule } from 'nest-winston'
import * as winston from 'winston'
import 'winston-daily-rotate-file'

const fileTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/trivia-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxFiles: '90d',
  format: winston.format.combine(
    winston.format.timestamp({ format: () => new Date().toISOString() }),
    winston.format.json(),
  ),
})

const consoleTransport = new winston.transports.Console({
  level: 'warn',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple(),
  ),
})

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [
        fileTransport,
        ...(process.env.NODE_ENV === 'production' ? [consoleTransport] : []),
      ],
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
