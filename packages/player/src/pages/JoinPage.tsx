import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../PlayerContext'

interface Props {
  prefillCode?: string
}

export function JoinPage({ prefillCode }: Props) {
  const { join, error, clearError } = usePlayer()
  const [code, setCode] = useState(prefillCode ?? '')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (prefillCode) setCode(prefillCode)
  }, [prefillCode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed || busy) return
    clearError()
    setBusy(true)
    await join(trimmed)
    setBusy(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Bar Trivia</h1>
        <p style={styles.subtitle}>Enter your room code to play</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            style={styles.input}
            disabled={busy}
          />

          {error && (
            <p style={styles.error}>{error}</p>
          )}

          <button type="submit" disabled={busy || !code.trim()} style={styles.button}>
            {busy ? 'Joining...' : 'Join Game'}
          </button>
        </form>
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
  } as React.CSSProperties,
  title: {
    fontSize: '2rem',
    fontWeight: 800,
    color: '#F9FAFB',
    margin: '0 0 0.25rem',
  } as React.CSSProperties,
  subtitle: {
    color: '#9CA3AF',
    margin: '0 0 2rem',
    fontSize: '1rem',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '0.875rem 1rem',
    fontSize: '1.5rem',
    fontWeight: 700,
    letterSpacing: '0.2em',
    textAlign: 'center' as const,
    border: '2px solid #374151',
    borderRadius: '0.75rem',
    background: '#1F2937',
    color: '#F9FAFB',
    outline: 'none',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  error: {
    color: '#F87171',
    margin: 0,
    fontSize: '0.875rem',
  } as React.CSSProperties,
  button: {
    padding: '0.875rem',
    fontSize: '1.125rem',
    fontWeight: 700,
    borderRadius: '0.75rem',
    border: 'none',
    background: '#6366F1',
    color: '#fff',
    cursor: 'pointer',
    opacity: 1,
  } as React.CSSProperties,
}
