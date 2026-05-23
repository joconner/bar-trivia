import { useState, FormEvent } from 'react'
import { login, register } from '../api'

interface Props {
  onLogin: (token: string) => void
}

export default function Login({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let token: string
      if (mode === 'login') {
        const res = await login(email, password)
        token = res.accessToken
      } else {
        const res = await register(email, password, displayName)
        token = res.accessToken
      }
      onLogin(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen" style={{ justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.25rem' }}>🎙</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Bar Trivia</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Host Dashboard</p>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <div className="field">
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Host name"
              required
              minLength={1}
              maxLength={50}
              autoComplete="name"
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="host@bar.com"
            required
            autoComplete="email"
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>

        {error && <p className="error-msg" style={{ marginBottom: '0.75rem' }}>{error}</p>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
          style={{ background: 'none', color: 'var(--text-dim)', textDecoration: 'underline', padding: '0.5rem', width: 'auto' }}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
