import { useState, useEffect } from 'react'
import type { RoomStateDto } from '@bar-trivia/shared'

interface FinalViewProps {
  state: RoomStateDto
}

// Podium reveals 3rd -> 2nd -> 1st with 2-second pauses between each.
export function FinalView({ state }: FinalViewProps) {
  const [revealedRanks, setRevealedRanks] = useState<number[]>([])
  const podium = state.finalPodium ?? []

  useEffect(() => {
    setRevealedRanks([])
    const timers: ReturnType<typeof setTimeout>[] = []

    timers.push(setTimeout(() => setRevealedRanks([3]), 1000))
    timers.push(setTimeout(() => setRevealedRanks([3, 2]), 3000))
    timers.push(setTimeout(() => setRevealedRanks([3, 2, 1]), 5000))

    return () => timers.forEach(clearTimeout)
  }, [])

  const getPodiumEntry = (rank: number) => podium.find((e) => e.rank === rank)

  return (
    <div className="final-view">
      <h1 className="final-title">Final Results</h1>
      <p className="pack-title">{state.packTitle}</p>

      <div className="final-body">
        <div className="podium-section">
          <div className="podium-stage">
            {/* 2nd place */}
            <div className={`podium-slot rank-2${revealedRanks.includes(2) ? ' revealed' : ''}`}>
              {revealedRanks.includes(2) && getPodiumEntry(2) && (
                <>
                  <div className="podium-player">{getPodiumEntry(2)!.displayName}</div>
                  <div className="podium-score">{getPodiumEntry(2)!.score} pts</div>
                </>
              )}
              <div className="podium-block block-2">2nd</div>
            </div>

            {/* 1st place */}
            <div className={`podium-slot rank-1${revealedRanks.includes(1) ? ' revealed' : ''}`}>
              {revealedRanks.includes(1) && getPodiumEntry(1) && (
                <>
                  <div className="podium-crown">&#x1F451;</div>
                  <div className="podium-player champion">{getPodiumEntry(1)!.displayName}</div>
                  <div className="podium-score">{getPodiumEntry(1)!.score} pts</div>
                </>
              )}
              <div className="podium-block block-1">1st</div>
            </div>

            {/* 3rd place */}
            <div className={`podium-slot rank-3${revealedRanks.includes(3) ? ' revealed' : ''}`}>
              {revealedRanks.includes(3) && getPodiumEntry(3) && (
                <>
                  <div className="podium-player">{getPodiumEntry(3)!.displayName}</div>
                  <div className="podium-score">{getPodiumEntry(3)!.score} pts</div>
                </>
              )}
              <div className="podium-block block-3">3rd</div>
            </div>
          </div>
        </div>

        <div className="final-leaderboard">
          <h2>All Players</h2>
          <ol className="final-lb-list">
            {state.leaderboard.map((entry) => (
              <li key={entry.participantId} className="final-lb-entry">
                <span className="final-lb-rank">#{entry.rank}</span>
                <span className="final-lb-name">{entry.displayName}</span>
                <span className="final-lb-score">{entry.score}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
