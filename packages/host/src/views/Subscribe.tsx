import { useState } from 'react'
import { createCheckoutSession, createPortalSession } from '../api'

interface Props {
  onBack: () => void
}

export default function Subscribe({ onBack }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubscribe() {
    setLoading(true)
    setError('')
    try {
      const successUrl = `${window.location.origin}/host/?subscribed=1`
      const cancelUrl = `${window.location.origin}/host/`
      const { url } = await createCheckoutSession(successUrl, cancelUrl)
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout')
      setLoading(false)
    }
  }

  async function handleManage() {
    setLoading(true)
    setError('')
    try {
      const returnUrl = `${window.location.origin}/host/`
      const { url } = await createPortalSession(returnUrl)
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open billing portal')
      setLoading(false)
    }
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="btn-icon btn-sm" onClick={onBack}>‹</button>
        <h1 className="screen-title">Subscription Required</h1>
      </div>

      <div className="screen-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', paddingTop: '3rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '20rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎯</p>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Your trial has ended</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Subscribe to keep hosting trivia nights and running rooms for your players.
          </p>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '16rem' }}>
          <button className="btn-primary" onClick={handleSubscribe} disabled={loading}>
            {loading ? 'Opening…' : 'Subscribe Now'}
          </button>
          <button className="btn-secondary" onClick={handleManage} disabled={loading}>
            Manage Billing
          </button>
          <button
            style={{ background: 'none', color: 'var(--text-dim)', fontSize: '0.85rem', padding: '0.25rem' }}
            onClick={onBack}
            disabled={loading}
          >
            Back to packs
          </button>
        </div>
      </div>
    </div>
  )
}
