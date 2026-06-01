import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { LateJoinPolicy, PhoneTextMode } from '@prisma/client'
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
      where: { ownerId, deletedAt: null },
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
    if (!pack || pack.deletedAt !== null) throw new NotFoundException('Pack not found')
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
    // Soft-delete: a pack referenced by any historical Room can't be hard-deleted
    // (no cascade from Pack to Room), and even unused packs represent real
    // host-authored content. Setting deletedAt hides it from listPacks/getPack
    // while preserving the row and all its games/questions for possible undelete.
    await this.prisma.pack.update({
      where: { id: packId },
      data: { deletedAt: new Date() },
    })
  }

  async addGame(
    packId: string,
    ownerId: string,
    body: {
      title: string
      lateJoinDefault?: LateJoinPolicy
      tiebreakerMethod?: string
      phoneTextMode?: PhoneTextMode
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
      lateJoinDefault: LateJoinPolicy
      tiebreakerMethod: string
      phoneTextMode: PhoneTextMode
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
      select: { ownerId: true, deletedAt: true },
    })
    if (!pack || pack.deletedAt !== null) throw new NotFoundException('Pack not found')
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
