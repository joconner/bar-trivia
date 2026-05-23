import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { RoomStateStore } from './room-state.store'
import { RoomsService } from './rooms.service'
import { RoomsController } from './rooms.controller'
import { RoomsGateway } from './rooms.gateway'

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [RoomsController],
  providers: [RoomStateStore, RoomsService, RoomsGateway],
  exports: [RoomsService, RoomStateStore],
})
export class RoomsModule {}
