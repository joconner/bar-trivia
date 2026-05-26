import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common'
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { Request, Response } from 'express'
import { RoomsService } from './rooms.service'
import { Roles } from '../auth/roles.decorator'
import { Public } from '../auth/public.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import { AccessTokenPayload, SubmitAnswerRequestSchema } from '@bar-trivia/shared'

const CreateRoomSchema = z.object({
  packId: z.string().uuid(),
  gameId: z.string().uuid(),
})
class CreateRoomDto extends createZodDto(CreateRoomSchema) {}

const UpdateLobbySchema = z.object({
  lateJoinPolicy: z.enum(['open', 'locked']).optional(),
  phoneTextMode: z.enum(['heads_up', 'full']).optional(),
})
class UpdateLobbyDto extends createZodDto(UpdateLobbySchema) {}

const SelectGameSchema = z.object({ gameId: z.string().uuid() })
class SelectGameDto extends createZodDto(SelectGameSchema) {}

const KickSchema = z.object({ participantId: z.string().uuid() })
class KickDto extends createZodDto(KickSchema) {}

class SubmitAnswerDto extends createZodDto(SubmitAnswerRequestSchema) {}

const REFRESH_COOKIE = 'refresh_token'
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/auth/refresh',
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  @Roles('host')
  async createRoom(@Body() body: CreateRoomDto, @CurrentUser() user: AccessTokenPayload) {
    return this.rooms.createRoom(user.sub, body)
  }

  // Declared before :roomCode so /rooms/active doesn't get routed as
  // getRoom(roomCode='active'). TV polls this to auto-discover a room.
  @Get('active')
  @Public()
  getActive() {
    return this.rooms.getActiveRooms()
  }

  @Get(':roomCode')
  @Public()
  getRoom(@Param('roomCode') roomCode: string) {
    return this.rooms.getRoomStateDto(roomCode)
  }

  @Patch(':roomCode')
  @Roles('host')
  updateConfig(
    @Param('roomCode') roomCode: string,
    @Body() body: UpdateLobbyDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.rooms.updateLobbyConfig(roomCode, user.sub, body)
  }

  @Post(':roomCode/join')
  @Public()
  @HttpCode(200)
  async joinRoom(
    @Param('roomCode') roomCode: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const authHeader = req.headers.authorization
    const result = await this.rooms.joinRoom(roomCode, authHeader)
    if (result.refreshToken) {
      res.cookie(REFRESH_COOKIE, result.refreshToken, REFRESH_COOKIE_OPTIONS)
    }
    return { accessToken: result.accessToken, participant: result.participant }
  }

  @Post(':roomCode/reroll-name')
  @HttpCode(200)
  async rerollName(
    @Param('roomCode') roomCode: string,
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.rooms.rerollName(roomCode, user)
  }

  @Post(':roomCode/game/start')
  @Roles('host')
  startGame(@Param('roomCode') roomCode: string, @CurrentUser() user: AccessTokenPayload) {
    return this.rooms.startGame(roomCode, user.sub)
  }

  @Post(':roomCode/game/select-game')
  @Roles('host')
  async selectGame(
    @Param('roomCode') roomCode: string,
    @Body() body: SelectGameDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.rooms.selectGame(roomCode, user.sub, body.gameId)
  }

  @Post(':roomCode/game/pause')
  @Roles('host')
  @HttpCode(200)
  pauseGame(@Param('roomCode') roomCode: string, @CurrentUser() user: AccessTokenPayload) {
    return this.rooms.pauseGame(roomCode, user.sub)
  }

  @Post(':roomCode/game/advance')
  @Roles('host')
  @HttpCode(200)
  async advance(@Param('roomCode') roomCode: string, @CurrentUser() user: AccessTokenPayload) {
    return this.rooms.advance(roomCode, user.sub)
  }

  @Post(':roomCode/game/kick')
  @Roles('host')
  @HttpCode(200)
  async kick(
    @Param('roomCode') roomCode: string,
    @Body() body: KickDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.rooms.kick(roomCode, user.sub, body.participantId)
  }

  @Post(':roomCode/answers')
  @HttpCode(200)
  submitAnswer(
    @Param('roomCode') roomCode: string,
    @Body() body: SubmitAnswerDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.rooms.submitAnswer(roomCode, user, body)
  }
}
