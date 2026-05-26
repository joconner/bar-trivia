import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { RoomState } from '../../src/rooms/room-state'
import { makeGameConfig, makeQuestion } from './test-utils'

function newRoom() {
  return new RoomState({
    roomId: randomUUID(),
    roomCode: 'WXYZ',
    hostId: randomUUID(),
    packId: randomUUID(),
    packTitle: 'Pack',
    gameConfig: makeGameConfig([makeQuestion()]),
  })
}

describe('RoomState construction', () => {
  it('starts in lobby with no active question and a fresh timer', () => {
    const room = newRoom()
    expect(room.phase).toBe('lobby')
    expect(room.currentQuestionIndex).toBe(-1)
    expect(room.currentGameIndex).toBe(0)
    expect(room.questionStartedAt).toBeNull()
    expect(room.participants.size).toBe(0)
    expect(room.timer).toEqual({
      endsAt: null,
      isPaused: false,
      pausedRemainingMs: null,
      timeoutRef: null,
    })
  })
})

describe('RoomState timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('startTimer sets endsAt and fires onExpiry after the duration', () => {
    const room = newRoom()
    const onExpiry = vi.fn()
    room.startTimer(5000, onExpiry)

    expect(room.timer.endsAt?.getTime()).toBe(Date.now() + 5000)
    expect(room.timer.isPaused).toBe(false)
    expect(onExpiry).not.toHaveBeenCalled()

    vi.advanceTimersByTime(4999)
    expect(onExpiry).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onExpiry).toHaveBeenCalledOnce()
  })

  it('startTimer replaces an existing timer (no double-fire)', () => {
    const room = newRoom()
    const first = vi.fn()
    const second = vi.fn()
    room.startTimer(5000, first)
    room.startTimer(3000, second)

    vi.advanceTimersByTime(5000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('pauseTimer stops the countdown and records the remaining time', () => {
    const room = newRoom()
    const onExpiry = vi.fn()
    room.startTimer(10_000, onExpiry)

    vi.advanceTimersByTime(4000)
    expect(room.pauseTimer()).toBe(true)
    expect(room.timer.isPaused).toBe(true)
    expect(room.timer.endsAt).toBeNull()
    expect(room.timer.pausedRemainingMs).toBe(6000)

    // While paused the expiry must never fire.
    vi.advanceTimersByTime(60_000)
    expect(onExpiry).not.toHaveBeenCalled()
  })

  it('pauseTimer returns false when there is no running timer', () => {
    const room = newRoom()
    expect(room.pauseTimer()).toBe(false)
  })

  it('pauseTimer returns false when already paused', () => {
    const room = newRoom()
    room.startTimer(10_000, vi.fn())
    room.pauseTimer()
    expect(room.pauseTimer()).toBe(false)
  })

  it('resumeTimer restarts the countdown from the remaining time', () => {
    const room = newRoom()
    const onExpiry = vi.fn()
    room.startTimer(10_000, onExpiry)
    vi.advanceTimersByTime(4000)
    room.pauseTimer()

    expect(room.resumeTimer(onExpiry)).toBe(true)
    expect(room.timer.isPaused).toBe(false)
    expect(room.timer.pausedRemainingMs).toBeNull()
    expect(room.timer.endsAt?.getTime()).toBe(Date.now() + 6000)

    vi.advanceTimersByTime(5999)
    expect(onExpiry).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onExpiry).toHaveBeenCalledOnce()
  })

  it('resumeTimer returns false when not paused', () => {
    const room = newRoom()
    expect(room.resumeTimer(vi.fn())).toBe(false)
    room.startTimer(5000, vi.fn())
    expect(room.resumeTimer(vi.fn())).toBe(false)
  })

  it('clearTimer cancels a pending expiry and resets all timer fields', () => {
    const room = newRoom()
    const onExpiry = vi.fn()
    room.startTimer(5000, onExpiry)
    room.clearTimer()

    expect(room.timer).toEqual({
      endsAt: null,
      isPaused: false,
      pausedRemainingMs: null,
      timeoutRef: null,
    })
    vi.advanceTimersByTime(10_000)
    expect(onExpiry).not.toHaveBeenCalled()
  })
})
