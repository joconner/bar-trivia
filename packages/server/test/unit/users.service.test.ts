import { describe, it, expect, afterEach, vi } from 'vitest'
import { UsersService } from '../../src/users/users.service'
import { ADJECTIVES, ANIMALS } from '../../src/users/word-list'

describe('UsersService.generateDisplayName', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('produces a name composed of a known adjective and animal', () => {
    const name = new UsersService().generateDisplayName()
    const matched = ADJECTIVES.some(
      (adj) => name.startsWith(adj) && ANIMALS.includes(name.slice(adj.length)),
    )
    expect(matched).toBe(true)
  })

  it('never returns a name present in the exclude set', () => {
    const svc = new UsersService()
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const name = svc.generateDisplayName(seen)
      expect(seen.has(name)).toBe(false)
      seen.add(name)
    }
  })

  it('skips an excluded name and returns a different valid one', () => {
    const svc = new UsersService()
    // Force a deterministic ordering so the first candidate is predictable.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const first = svc.generateDisplayName()
    const second = svc.generateDisplayName(new Set([first]))
    expect(second).not.toBe(first)
  })
})
