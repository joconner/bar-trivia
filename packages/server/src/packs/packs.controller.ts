import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
} from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { PacksService } from './packs.service'
import { Roles } from '../auth/roles.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import { AccessTokenPayload, MultipleChoiceDataSchema } from '@bar-trivia/shared'

const CreatePackBodySchema = z.object({
  title: z.string().min(1).max(100),
})
class CreatePackDto extends createZodDto(CreatePackBodySchema) {}

const UpdatePackBodySchema = z.object({
  title: z.string().min(1).max(100),
})
class UpdatePackDto extends createZodDto(UpdatePackBodySchema) {}

const CreateGameBodySchema = z.object({
  title: z.string().min(1).max(100),
  lateJoinDefault: z.enum(['open', 'locked']).default('open'),
  tiebreakerMethod: z.enum(['response_time']).default('response_time'),
  phoneTextMode: z.enum(['heads_up', 'full']).default('heads_up'),
})
class CreateGameDto extends createZodDto(CreateGameBodySchema) {}

const UpdateGameBodySchema = CreateGameBodySchema.partial()
class UpdateGameDto extends createZodDto(UpdateGameBodySchema) {}

const CreateQuestionBodySchema = z.object({
  prompt: z.string().min(1).max(1000),
  imageUrl: z.string().url().nullable().optional(),
  data: MultipleChoiceDataSchema,
  defaultTimerSeconds: z.number().int().min(5).max(120).default(30),
})
class CreateQuestionDto extends createZodDto(CreateQuestionBodySchema) {}

const UpdateQuestionBodySchema = CreateQuestionBodySchema.partial()
class UpdateQuestionDto extends createZodDto(UpdateQuestionBodySchema) {}

const ReorderQuestionsBodySchema = z.object({
  questionIds: z.array(z.string().uuid()).min(1),
})
class ReorderQuestionsDto extends createZodDto(ReorderQuestionsBodySchema) {}

@Controller('packs')
@Roles('host')
export class PacksController {
  constructor(private readonly packs: PacksService) {}

  // --- Pack CRUD ---

  @Get()
  listPacks(@CurrentUser() user: AccessTokenPayload) {
    return this.packs.listPacks(user.sub)
  }

  @Post()
  createPack(@CurrentUser() user: AccessTokenPayload, @Body() body: CreatePackDto) {
    return this.packs.createPack(user.sub, body.title)
  }

  @Get(':packId')
  getPack(@Param('packId') packId: string, @CurrentUser() user: AccessTokenPayload) {
    return this.packs.getPack(packId, user.sub)
  }

  @Patch(':packId')
  updatePack(
    @Param('packId') packId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdatePackDto,
  ) {
    return this.packs.updatePack(packId, user.sub, body.title)
  }

  @Delete(':packId')
  @HttpCode(204)
  deletePack(@Param('packId') packId: string, @CurrentUser() user: AccessTokenPayload) {
    return this.packs.deletePack(packId, user.sub)
  }

  // --- Game CRUD ---

  @Post(':packId/games')
  addGame(
    @Param('packId') packId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateGameDto,
  ) {
    return this.packs.addGame(packId, user.sub, body)
  }

  @Patch(':packId/games/:gameId')
  updateGame(
    @Param('packId') packId: string,
    @Param('gameId') gameId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateGameDto,
  ) {
    return this.packs.updateGame(packId, gameId, user.sub, body)
  }

  @Delete(':packId/games/:gameId')
  @HttpCode(204)
  deleteGame(
    @Param('packId') packId: string,
    @Param('gameId') gameId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.packs.deleteGame(packId, gameId, user.sub)
  }

  // --- Question CRUD ---
  // reorder must be defined before :questionId to avoid route shadowing

  @Patch(':packId/games/:gameId/questions/reorder')
  reorderQuestions(
    @Param('packId') packId: string,
    @Param('gameId') gameId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: ReorderQuestionsDto,
  ) {
    return this.packs.reorderQuestions(packId, gameId, user.sub, body.questionIds)
  }

  @Post(':packId/games/:gameId/questions')
  addQuestion(
    @Param('packId') packId: string,
    @Param('gameId') gameId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateQuestionDto,
  ) {
    return this.packs.addQuestion(packId, gameId, user.sub, body)
  }

  @Patch(':packId/games/:gameId/questions/:questionId')
  updateQuestion(
    @Param('packId') packId: string,
    @Param('gameId') gameId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateQuestionDto,
  ) {
    return this.packs.updateQuestion(packId, gameId, questionId, user.sub, body)
  }

  @Delete(':packId/games/:gameId/questions/:questionId')
  @HttpCode(204)
  deleteQuestion(
    @Param('packId') packId: string,
    @Param('gameId') gameId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.packs.deleteQuestion(packId, gameId, questionId, user.sub)
  }
}
