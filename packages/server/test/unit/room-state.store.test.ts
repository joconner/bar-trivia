import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { RoomStateStore } from '../../src/rooms/room-state.store'
import { RoomState } from '../../src/rooms/room-state'
import { makeGameConfig, makeQuestion } from './test-utils'

function makeState(roomCode: string) {
  return new RoomState({
    roomId: randomUUID(),
    roomCode,
    hostId: randomUUID(),
    packId: randomUUID(),
    packTitle: 'Pack',
    gameConfig: makeGameConfig([makeQuestion()]),
  })
}

describe('RoomStateStore', () => {
  let store: RoomStateStore

  beforeEach(() => {
    store = new RoomStateStore()
  })

  it('returns undefined for an unknown room', () => {
    expect(store.get('NOPE')).toBeUndefined()
    expect(store.has('NOPE')).toBe(false)
  })

  it('stores and retrieves a room by code', () => {
    const state = makeState('WXYZ')
    store.set('WXYZ', state)
    expect(store.get('WXYZ')).toBe(state)
    expect(store.has('WXYZ')).toBe(true)
  })

  it('overwrites an existing room on set', () => {
    const a = makeState('WXYZ')
    const b = makeState('WXYZ')
    store.set('WXYZ', a)
    store.set('WXYZ', b)
    expect(store.get('WXYZ')).toBe(b)
  })

  it('deletes a room', () => {
    store.set('WXYZ', makeState('WXYZ'))
    store.delete('WXYZ')
    expect(store.has('WXYZ')).toBe(false)
    expect(store.get('WXYZ')).toBeUndefined()
  })

  it('delete is a no-op for an unknown room', () => {
    expect(() => store.delete('NOPE')).not.toThrow()
  })
})
