import { Module } from '@nestjs/common'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { PacksModule } from './packs/packs.module'

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, PacksModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
