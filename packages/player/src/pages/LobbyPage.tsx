import { usePlayer } from '../PlayerContext'

export function LobbyPage() {
  const { displayName, roomCode, roomState, reroll, error } = usePlayer()

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.roomLabel}>Room</p>
        <p style={styles.roomCode}>{roomCode}</p>

        <div style={styles.nameBadge}>
          <p style={styles.nameLabel}>You are</p>
          <p style={styles.name}>{displayName}</p>
        </div>

        <button onClick={reroll} style={styles.rerollBtn} type="button">
          Try a different name
        </button>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.waitBox}>
          <span style={styles.dot} />
          <p style={styles.waitText}>
            Waiting for the host to start&hellip;
          </p>
        </div>

        {roomState && (
          <p style={styles.playerCount}>
            {roomState.players.length}{' '}
            {roomState.players.length === 1 ? 'player' : 'players'} in the lobby
          </p>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#111827',
    padding: '1rem',
  } as React.CSSProperties,
  card: {
    width: '100%',
    maxWidth: '360px',
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '1rem',
  } as React.CSSProperties,
  roomLabel: {
    color: '#6B7280',
    margin: 0,
    fontSize: '0.875rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
  } as React.CSSProperties,
  roomCode: {
    fontSize: '2rem',
    fontWeight: 800,
    color: '#F9FAFB',
    margin: 0,
    letterSpacing: '0.15em',
  } as React.CSSProperties,
  nameBadge: {
    background: '#1F2937',
    border: '2px solid #374151',
    borderRadius: '1rem',
    padding: '1.25rem 2rem',
    width: '100%',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  nameLabel: {
    color: '#9CA3AF',
    margin: '0 0 0.25rem',
    fontSize: '0.875rem',
  } as React.CSSProperties,
  name: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#F9FAFB',
    margin: 0,
  } as React.CSSProperties,
  rerollBtn: {
    background: 'none',
    border: 'none',
    color: '#818CF8',
    fontSize: '0.975rem',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: '0.25rem',
  } as React.CSSProperties,
  error: {
    color: '#F87171',
    margin: 0,
    fontSize: '0.875rem',
  } as React.CSSProperties,
  waitBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '1rem',
  } as React.CSSProperties,
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#4ADE80',
    flexShrink: 0,
    animation: 'pulse 1.5s ease-in-out infinite',
  } as React.CSSProperties,
  waitText: {
    color: '#9CA3AF',
    margin: 0,
    fontSize: '0.9rem',
  } as React.CSSProperties,
  playerCount: {
    color: '#6B7280',
    margin: 0,
    fontSize: '0.8rem',
  } as React.CSSProperties,
}
