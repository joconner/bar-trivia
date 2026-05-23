import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { MultipleChoiceData } from '@bar-trivia/shared'

const GAME_INCLUDE = {
  questions: { orderBy: { position: 'asc' as const } },
}

const PACK_INCLUDE = {
  games: {
    orderBy: { position: 'asc' as const },
    include: GAME_INCLUDE,
  },
}

@Injectable()
export class PacksService {
  constructor(private readonly prisma: PrismaService) {}

  listPacks(ownerId: string) {
    return this.prisma.pack.findMany({
      where: { ownerId },
      include: PACK_INCLUDE,
      orderBy: { createdAt: 'asc' },
    })
  }

  createPack(ownerId: string, title: string) {
    return this.prisma.pack.create({
      data: { ownerId, title },
      include: PACK_INCLUDE,
    })
  }

  async getPack(packId: string, ownerId: string) {
    const pack = await this.prisma.pack.findUnique({
      where: { id: packId },
      include: PACK_INCLUDE,
    })
    if (!pack) throw new NotFoundException('Pack not found')
    this.checkOwner(pack.ownerId, ownerId)
    return pack
  }

  async updatePack(packId: string, ownerId: string, title: string) {
    await this.requirePackOwner(packId, ownerId)
    return this.prisma.pack.update({
      where: { id: packId },
      data: { title },
      include: PACK_INCLUDE,
    })
  }

  async deletePack(packId: string, ownerId: string) {
    await this.requirePackOwner(packId, ownerId)
    await this.prisma.pack.delete({ where: { id: packId } })
  }

  async addGame(
    packId: string,
    ownerId: string,
    body: {
      title: string
      lateJoinDefault?: string
      tiebreakerMethod?: string
      phoneTextMode?: string
    },
  ) {
    await this.requirePackOwner(packId, ownerId)
    const count = await this.prisma.game.count({ where: { packId } })
    return this.prisma.game.create({
      data: {
        packId,
        title: body.title,
        position: count,
        lateJoinDefault: body.lateJoinDefault ?? 'open',
        tiebreakerMethod: body.tiebreakerMethod ?? 'response_time',
        phoneTextMode: body.phoneTextMode ?? 'heads_up',
      },
      include: GAME_INCLUDE,
    })
  }

  async updateGame(
    packId: string,
    gameId: string,
    ownerId: string,
    body: Partial<{
      title: string
      lateJoinDefault: string
      tiebreakerMethod: string
      phoneTextMode: string
    }>,
  ) {
    await this.requirePackOwner(packId, ownerId)
    await this.requireGameInPack(gameId, packId)
    return this.prisma.game.update({
      where: { id: gameId },
      data: body,
      include: GAME_INCLUDE,
    })
  }

  async deleteGame(packId: string, gameId: string, ownerId: string) {
    await this.requirePackOwner(packId, ownerId)
    await this.requireGameInPack(gameId, packId)
    await this.prisma.game.delete({ where: { id: gameId } })
  }

  async addQuestion(
    packId: string,
    gameId: string,
    ownerId: string,
    body: {
      prompt: string
      imageUrl?: string | null
      data: MultipleChoiceData
      defaultTimerSeconds?: number
    },
  ) {
    await this.requirePackOwner(packId, ownerId)
    await this.requireGameInPack(gameId, packId)
    const count = await this.prisma.question.count({ where: { gameId } })
    return this.prisma.question.create({
      data: {
        gameId,
        type: 'multiple_choice',
        prompt: body.prompt,
        imageUrl: body.imageUrl ?? null,
        data: body.data as object,
        defaultTimerSeconds: body.defaultTimerSeconds ?? 30,
        position: count,
      },
    })
  }

  async updateQuestion(
    packId: string,
    gameId: string,
    questionId: string,
    ownerId: string,
    body: Partial<{
      prompt: string
      imageUrl: string | null
      data: MultipleChoiceData
      defaultTimerSeconds: number
    }>,
  ) {
    await this.requirePackOwner(packId, ownerId)
    await this.requireGameInPack(gameId, packId)
    await this.requireQuestionInGame(questionId, gameId)
    const { data, ...rest } = body
    return this.prisma.question.update({
      where: { id: questionId },
      data: {
        ...rest,
        ...(data !== undefined ? { data: data as object } : {}),
      },
    })
  }

  async deleteQuestion(
    packId: string,
    gameId: string,
    questionId: string,
    ownerId: string,
  ) {
    await this.requirePackOwner(packId, ownerId)
    await this.requireGameInPack(gameId, packId)
    await this.requireQuestionInGame(questionId, gameId)
    await this.prisma.question.delete({ where: { id: questionId } })
  }

  async reorderQuestions(
    packId: string,
    gameId: string,
    ownerId: string,
    questionIds: string[],
  ) {
    await this.requirePackOwner(packId, ownerId)
    await this.requireGameInPack(gameId, packId)

    const existing = await this.prisma.question.findMany({
      where: { gameId },
      select: { id: true },
    })

    const existingSet = new Set(existing.map((q) => q.id))
    const valid =
      questionIds.length === existing.length &&
      questionIds.every((id) => existingSet.has(id)) &&
      new Set(questionIds).size === questionIds.length

    if (!valid) {
      throw new BadRequestException(
        'questionIds must contain each question in this game exactly once',
      )
    }

    await Promise.all(
      questionIds.map((id, index) =>
        this.prisma.question.update({ where: { id }, data: { position: index } }),
      ),
    )

    return this.prisma.question.findMany({
      where: { gameId },
      orderBy: { position: 'asc' },
    })
  }

  private async requirePackOwner(packId: string, ownerId: string) {
    const pack = await this.prisma.pack.findUnique({
      where: { id: packId },
      select: { ownerId: true },
    })
    if (!pack) throw new NotFoundException('Pack not found')
    this.checkOwner(pack.ownerId, ownerId)
  }

  private checkOwner(packOwnerId: string, requestUserId: string) {
    if (packOwnerId !== requestUserId) throw new ForbiddenException('Not the pack owner')
  }

  private async requireGameInPack(gameId: string, packId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { packId: true },
    })
    if (!game || game.packId !== packId) throw new NotFoundException('Game not found in this pack')
  }

  private async requireQuestionInGame(questionId: string, gameId: string) {
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { gameId: true },
    })
    if (!q || q.gameId !== gameId) throw new NotFoundException('Question not found in this game')
  }
}
