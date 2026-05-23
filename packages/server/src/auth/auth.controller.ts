import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { Public } from './public.decorator'
import { createZodDto } from 'nestjs-zod'
import { RegisterHostRequestSchema, LoginRequestSchema } from '@bar-trivia/shared'

class RegisterDto extends createZodDto(RegisterHostRequestSchema) {}
class LoginDto extends createZodDto(LoginRequestSchema) {}

const REFRESH_COOKIE = 'refresh_token'
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/auth/refresh',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  async register(@Body() body: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.auth.register(body)
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS)
    return { accessToken }
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.auth.login(body)
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS)
    return { accessToken }
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined
    if (!raw) throw new UnauthorizedException('No refresh token')
    const { accessToken, refreshToken } = await this.auth.refresh(raw)
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS)
    return { accessToken }
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined
    if (raw) await this.auth.logout(raw)
    res.clearCookie(REFRESH_COOKIE, { path: '/auth/refresh' })
  }
}
