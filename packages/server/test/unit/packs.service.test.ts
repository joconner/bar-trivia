import { describe, it, expect, beforeEach } from 'vitest'
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { PacksService } from '../../src/packs/packs.service'
import { makePrismaMock, type PrismaMock } from './test-utils'

const OWNER = 'owner-1'

let prisma: PrismaMock
let service: PacksService

beforeEach(() => {
  prisma = makePrismaMock()
  service = new PacksService(prisma as never)
})

describe('createPack / listPacks', () => {
  it('creates a pack owned by the caller', () => {
    prisma.pack.create.mockReturnValue('created' as never)
    service.createPack(OWNER, 'My Pack')
    expect(prisma.pack.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ownerId: OWNER, title: 'My Pack' } }),
    )
  })

  it('lists house packs first, then the callers non-deleted packs', async () => {
    const housePacks = [{ id: 'house-pack-history', ownerId: 'house-user', games: [] }]
    const ownPacks = [{ id: 'p1', ownerId: OWNER, games: [] }]
    prisma.pack.findMany
      .mockResolvedValueOnce(housePacks as never)
      .mockResolvedValueOnce(ownPacks as never)

    const result = await service.listPacks(OWNER)

    expect(prisma.pack.findMany).toHaveBeenCalledTimes(2)
    expect(prisma.pack.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { ownerId: 'house-user', deletedAt: null } }),
    )
    expect(prisma.pack.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { ownerId: OWNER, deletedAt: null } }),
    )
    expect(result).toEqual([...housePacks, ...ownPacks])
  })

  it('lists only house packs when the house user lists its own', async () => {
    // The house user listing itself should not double-fetch. The query
    // returns house packs once, and the "own" query is short-circuited.
    const housePacks = [{ id: 'house-pack-history', ownerId: 'house-user', games: [] }]
    prisma.pack.findMany.mockResolvedValueOnce(housePacks as never)

    const result = await service.listPacks('house-user')

    expect(prisma.pack.findMany).toHaveBeenCalledTimes(1)
    expect(result).toEqual(housePacks)
  })
})

describe('ownership enforcement', () => {
  it('getPack throws NotFound when the pack is missing', async () => {
    prisma.pack.findUnique.mockResolvedValue(null)
    await expect(service.getPack('p1', OWNER)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('getPack throws Forbidden when another user owns the pack', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: 'someone-else', deletedAt: null })
    await expect(service.getPack('p1', OWNER)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('getPack returns the pack for its owner', async () => {
    const pack = { id: 'p1', ownerId: OWNER, deletedAt: null }
    prisma.pack.findUnique.mockResolvedValue(pack)
    await expect(service.getPack('p1', OWNER)).resolves.toBe(pack)
  })

  it('updatePack refuses a non-owner', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: 'other', deletedAt: null })
    await expect(service.updatePack('p1', OWNER, 'New')).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.pack.update).not.toHaveBeenCalled()
  })

  it('deletePack refuses when the pack is missing', async () => {
    prisma.pack.findUnique.mockResolvedValue(null)
    await expect(service.deletePack('p1', OWNER)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('shared (house) packs are readable by any host', () => {
  it('getPack returns a house pack to any host (not just its owner)', async () => {
    const housePack = { id: 'house-pack-history', ownerId: 'house-user', deletedAt: null }
    prisma.pack.findUnique.mockResolvedValue(housePack)
    await expect(service.getPack('house-pack-history', OWNER)).resolves.toBe(housePack)
  })

  it('getPack still rejects packs belonging to other hosts', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: 'someone-else', deletedAt: null })
    await expect(service.getPack('p1', OWNER)).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('shared (house) packs are read-only', () => {
  it('a regular host cannot edit a house-owned pack', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: 'house-user', deletedAt: null })
    await expect(service.updatePack('p1', OWNER, 'New title')).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.pack.update).not.toHaveBeenCalled()
  })

  it('a regular host cannot delete a house-owned pack', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: 'house-user', deletedAt: null })
    await expect(service.deletePack('p1', OWNER)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('a regular host cannot add games to a house-owned pack', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: 'house-user', deletedAt: null })
    await expect(service.addGame('p1', OWNER, { title: 'sneaky' })).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.game.create).not.toHaveBeenCalled()
  })
})

describe('soft-delete', () => {
  it('deletePack sets deletedAt instead of removing the row', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })

    await service.deletePack('p1', OWNER)

    expect(prisma.pack.delete).not.toHaveBeenCalled()
    expect(prisma.pack.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    )
  })

  it('getPack treats a soft-deleted pack as not found', async () => {
    prisma.pack.findUnique.mockResolvedValue({ id: 'p1', ownerId: OWNER, deletedAt: new Date() })
    await expect(service.getPack('p1', OWNER)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('requirePackOwner blocks mutations on a soft-deleted pack', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: new Date() })
    await expect(service.updatePack('p1', OWNER, 'New')).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.pack.update).not.toHaveBeenCalled()
  })
})

describe('addGame', () => {
  it('appends the game at the next position with sensible defaults', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })
    prisma.game.count.mockResolvedValue(2)
    prisma.game.create.mockResolvedValue({ id: 'g' })

    await service.addGame('p1', OWNER, { title: 'Round 3' })

    expect(prisma.game.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          packId: 'p1',
          title: 'Round 3',
          position: 2,
          lateJoinDefault: 'open',
          tiebreakerMethod: 'response_time',
          phoneTextMode: 'heads_up',
        }),
      }),
    )
  })

  it('honors explicitly supplied game options', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })
    prisma.game.count.mockResolvedValue(0)
    prisma.game.create.mockResolvedValue({ id: 'g' })

    await service.addGame('p1', OWNER, { title: 'R', lateJoinDefault: 'locked', phoneTextMode: 'full' })

    expect(prisma.game.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lateJoinDefault: 'locked', phoneTextMode: 'full' }),
      }),
    )
  })
})

describe('game/question containment checks', () => {
  it('updateGame throws NotFound when the game is not in the pack', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })
    prisma.game.findUnique.mockResolvedValue({ packId: 'a-different-pack' })
    await expect(service.updateGame('p1', 'g1', OWNER, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('updateQuestion throws NotFound when the question is not in the game', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })
    prisma.game.findUnique.mockResolvedValue({ packId: 'p1' })
    prisma.question.findUnique.mockResolvedValue({ gameId: 'a-different-game' })
    await expect(service.updateQuestion('p1', 'g1', 'q1', OWNER, { prompt: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

describe('addQuestion', () => {
  it('appends at the next position with multiple_choice defaults', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })
    prisma.game.findUnique.mockResolvedValue({ packId: 'p1' })
    prisma.question.count.mockResolvedValue(3)
    prisma.question.create.mockResolvedValue({ id: 'q' })

    const data = { type: 'multiple_choice' as const, choices: [], correctChoiceId: 'c1' }
    await service.addQuestion('p1', 'g1', OWNER, { prompt: 'Q?', data: data as never })

    expect(prisma.question.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gameId: 'g1',
          type: 'multiple_choice',
          position: 3,
          imageUrl: null,
          defaultTimerSeconds: 30,
        }),
      }),
    )
  })
})

describe('update/delete happy paths', () => {
  it('updateGame writes the patch once ownership and containment pass', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })
    prisma.game.findUnique.mockResolvedValue({ packId: 'p1' })
    prisma.game.update.mockResolvedValue({ id: 'g1' })

    await service.updateGame('p1', 'g1', OWNER, { title: 'Renamed' })

    expect(prisma.game.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'g1' }, data: { title: 'Renamed' } }),
    )
  })

  it('deleteGame deletes once checks pass', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })
    prisma.game.findUnique.mockResolvedValue({ packId: 'p1' })
    prisma.game.delete.mockResolvedValue({})

    await service.deleteGame('p1', 'g1', OWNER)
    expect(prisma.game.delete).toHaveBeenCalledWith({ where: { id: 'g1' } })
  })

  it('updateQuestion serializes question data when present', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })
    prisma.game.findUnique.mockResolvedValue({ packId: 'p1' })
    prisma.question.findUnique.mockResolvedValue({ gameId: 'g1' })
    prisma.question.update.mockResolvedValue({})

    const data = { type: 'multiple_choice' as const, choices: [], correctChoiceId: 'c1' }
    await service.updateQuestion('p1', 'g1', 'q1', OWNER, { prompt: 'New?', data: data as never })

    expect(prisma.question.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'q1' }, data: expect.objectContaining({ prompt: 'New?', data }) }),
    )
  })

  it('updateQuestion omits the data key when no data is supplied', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })
    prisma.game.findUnique.mockResolvedValue({ packId: 'p1' })
    prisma.question.findUnique.mockResolvedValue({ gameId: 'g1' })
    prisma.question.update.mockResolvedValue({})

    await service.updateQuestion('p1', 'g1', 'q1', OWNER, { prompt: 'Only prompt' })

    const arg = prisma.question.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data).toEqual({ prompt: 'Only prompt' })
    expect(arg.data).not.toHaveProperty('data')
  })

  it('deleteQuestion deletes once checks pass', async () => {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })
    prisma.game.findUnique.mockResolvedValue({ packId: 'p1' })
    prisma.question.findUnique.mockResolvedValue({ gameId: 'g1' })
    prisma.question.delete.mockResolvedValue({})

    await service.deleteQuestion('p1', 'g1', 'q1', OWNER)
    expect(prisma.question.delete).toHaveBeenCalledWith({ where: { id: 'q1' } })
  })
})

describe('reorderQuestions', () => {
  function passOwnershipAndGame() {
    prisma.pack.findUnique.mockResolvedValue({ ownerId: OWNER, deletedAt: null })
    prisma.game.findUnique.mockResolvedValue({ packId: 'p1' })
  }

  it('rejects a list whose length differs from the question count', async () => {
    passOwnershipAndGame()
    prisma.question.findMany.mockResolvedValueOnce([{ id: 'q1' }, { id: 'q2' }])
    await expect(service.reorderQuestions('p1', 'g1', OWNER, ['q1'])).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects a list containing an unknown question id', async () => {
    passOwnershipAndGame()
    prisma.question.findMany.mockResolvedValueOnce([{ id: 'q1' }, { id: 'q2' }])
    await expect(service.reorderQuestions('p1', 'g1', OWNER, ['q1', 'qX'])).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('rejects a list containing duplicates', async () => {
    passOwnershipAndGame()
    prisma.question.findMany.mockResolvedValueOnce([{ id: 'q1' }, { id: 'q2' }])
    await expect(service.reorderQuestions('p1', 'g1', OWNER, ['q1', 'q1'])).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('persists the new positions for a valid permutation', async () => {
    passOwnershipAndGame()
    prisma.question.findMany.mockResolvedValueOnce([{ id: 'q1' }, { id: 'q2' }])
    prisma.question.update.mockResolvedValue({})
    prisma.question.findMany.mockResolvedValueOnce([{ id: 'q2' }, { id: 'q1' }])

    await service.reorderQuestions('p1', 'g1', OWNER, ['q2', 'q1'])

    expect(prisma.question.update).toHaveBeenCalledWith({ where: { id: 'q2' }, data: { position: 0 } })
    expect(prisma.question.update).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { position: 1 } })
  })
})
