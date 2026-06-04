import { Module } from '@nestjs/common'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { PacksModule } from './packs/packs.module'
import { RoomsModule } from './rooms/rooms.module'
import { SubscriptionsModule } from './subscriptions/subscriptions.module'
import { LoggerModule } from './logger/logger.module'

@Module({
  imports: [LoggerModule, PrismaModule, AuthModule, UsersModule, PacksModule, RoomsModule, SubscriptionsModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
