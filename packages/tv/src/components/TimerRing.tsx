import { useState, useEffect } from 'react'

const RADIUS = 80
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface TimerRingProps {
  timerEndsAt: string | null
  isPaused: boolean
  pausedRemainingMs: number | null
  totalSeconds?: number
}

export function TimerRing({ timerEndsAt, isPaused, pausedRemainingMs, totalSeconds = 30 }: TimerRingProps) {
  const [remainingMs, setRemainingMs] = useState<number>(totalSeconds * 1000)

  useEffect(() => {
    if (isPaused && pausedRemainingMs !== null) {
      setRemainingMs(pausedRemainingMs)
      return
    }
    if (!timerEndsAt) return

    const update = () => {
      const remaining = new Date(timerEndsAt).getTime() - Date.now()
      setRemainingMs(Math.max(0, remaining))
    }

    update()
    const id = setInterval(update, 100)
    return () => clearInterval(id)
  }, [timerEndsAt, isPaused, pausedRemainingMs])

  const totalMs = totalSeconds * 1000
  const fraction = Math.max(0, Math.min(1, remainingMs / totalMs))
  const dashoffset = CIRCUMFERENCE * (1 - fraction)
  const seconds = Math.ceil(remainingMs / 1000)
  const isUrgent = seconds <= 5

  return (
    <div className="timer-ring">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r={RADIUS} fill="none" stroke="#333" strokeWidth="12" />
        <circle
          cx="90"
          cy="90"
          r={RADIUS}
          fill="none"
          stroke={isUrgent ? '#ef4444' : '#3b82f6'}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashoffset}
          transform="rotate(-90 90 90)"
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
      <div className={`timer-seconds${isUrgent ? ' urgent' : ''}`}>{isPaused ? '⏸' : seconds}</div>
    </div>
  )
}
