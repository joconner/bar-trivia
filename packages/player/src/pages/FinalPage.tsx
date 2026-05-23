import { usePlayer } from '../PlayerContext'

export function FinalPage() {
  const { roomState, participantId } = usePlayer()

  const me = participantId
    ? roomState?.leaderboard.find((e) => e.participantId === participantId)
    : undefined

  const rankLabel =
    me?.rank === 1 ? '1st' :
    me?.rank === 2 ? '2nd' :
    me?.rank === 3 ? '3rd' :
    me?.rank != null ? `${me.rank}th` : null

  const podiumEntry = roomState?.finalPodium?.find((e) => e.participantId === participantId)

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.eyebrow}>Game over</p>
        <h1 style={styles.title}>
          {me?.displayName ?? 'You'}
        </h1>

        {rankLabel && (
          <div style={styles.rankBadge}>
            <span style={styles.rankNum}>{rankLabel}</span>
            <span style={styles.rankSuffix}>place</span>
          </div>
        )}

        {me && (
          <div style={styles.scoreBadge}>
            <p style={styles.scoreLabel}>Final score</p>
            <p style={styles.scoreNum}>{me.score}</p>
          </div>
        )}

        {podiumEntry && me?.rank === 1 && (
          <p style={styles.congrats}>Congratulations!</p>
        )}

        {roomState && (
          <div style={styles.leaderboard}>
            <p style={styles.lbTitle}>Leaderboard</p>
            {roomState.leaderboard.slice(0, 10).map((entry) => (
              <div
                key={entry.participantId}
                style={{
                  ...styles.lbRow,
                  background: entry.participantId === participantId ? '#1E3A5F' : '#1F2937',
                  border: entry.participantId === participantId ? '1px solid #3B82F6' : '1px solid transparent',
                }}
              >
                <span style={styles.lbRank}>#{entry.rank}</span>
                <span style={styles.lbName}>{entry.displayName}</span>
                <span style={styles.lbScore}>{entry.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    background: '#111827',
    padding: '2rem 1rem',
    overflowY: 'auto' as const,
  } as React.CSSProperties,
  card: {
    width: '100%',
    maxWidth: '360px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '1rem',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  eyebrow: {
    color: '#6B7280',
    fontSize: '0.875rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    margin: 0,
  } as React.CSSProperties,
  title: {
    fontSize: '1.75rem',
    fontWeight: 800,
    color: '#F9FAFB',
    margin: 0,
  } as React.CSSProperties,
  rankBadge: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.375rem',
  } as React.CSSProperties,
  rankNum: {
    fontSize: '4rem',
    fontWeight: 900,
    color: '#FBBF24',
    lineHeight: 1,
  } as React.CSSProperties,
  rankSuffix: {
    fontSize: '1.25rem',
    color: '#D97706',
    fontWeight: 600,
  } as React.CSSProperties,
  scoreBadge: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    padding: '0.875rem 2rem',
  } as React.CSSProperties,
  scoreLabel: {
    color: '#9CA3AF',
    fontSize: '0.8rem',
    margin: '0 0 0.25rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  scoreNum: {
    color: '#F9FAFB',
    fontSize: '2rem',
    fontWeight: 800,
    margin: 0,
  } as React.CSSProperties,
  congrats: {
    color: '#4ADE80',
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: 0,
  } as React.CSSProperties,
  leaderboard: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.375rem',
    marginTop: '0.5rem',
  } as React.CSSProperties,
  lbTitle: {
    color: '#6B7280',
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    margin: '0 0 0.25rem',
    textAlign: 'left' as const,
  } as React.CSSProperties,
  lbRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
  } as React.CSSProperties,
  lbRank: {
    color: '#6B7280',
    fontSize: '0.8rem',
    fontWeight: 600,
    minWidth: '2rem',
  } as React.CSSProperties,
  lbName: {
    color: '#E5E7EB',
    fontSize: '0.9rem',
    flex: 1,
    textAlign: 'left' as const,
  } as React.CSSProperties,
  lbScore: {
    color: '#F9FAFB',
    fontSize: '0.9rem',
    fontWeight: 700,
  } as React.CSSProperties,
}
