import { useState, useEffect, FormEvent } from 'react'
import { HOUSE_USER_ID, type Pack } from '@bar-trivia/shared'
import { listPacks, createPack, logout, getSubscriptionStatus } from '../api'

interface SubscriptionBannerProps {
  status: string
  trialEndsAt: string | null
  onSubscribeRequired: () => void
}

function SubscriptionBanner({ status, trialEndsAt, onSubscribeRequired }: SubscriptionBannerProps) {
  if (status === 'active' || status === 'trialing') return null

  let message = ''
  let urgent = false

  if (status === 'trial' && trialEndsAt) {
    const daysLeft = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysLeft > 3) {
      message = `${daysLeft} days left in your free trial.`
    } else if (daysLeft > 0) {
      message = `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your trial - subscribe to keep hosting.`
      urgent = true
    } else {
      message = 'Your trial has ended. Subscribe to host rooms.'
      urgent = true
    }
  } else if (status === 'trial_expired') {
    message = 'Your trial has ended. Subscribe to host rooms.'
    urgent = true
  } else if (status === 'past_due') {
    message = 'Payment issue - please update your billing.'
    urgent = true
  } else if (status === 'cancelled') {
    message = 'Your subscription was cancelled. Subscribe to host rooms.'
    urgent = true
  }

  if (!message) return null

  return (
    <div
      onClick={onSubscribeRequired}
      style={{
        cursor: 'pointer',
        padding: '0.6rem 1rem',
        background: urgent ? 'var(--danger-dim, #3b1515)' : 'var(--accent-dim, #1e3a8a)',
        color: urgent ? 'var(--danger, #f87171)' : 'var(--accent, #93c5fd)',
        fontSize: '0.85rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
      }}
    >
      <span>{message}</span>
      <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Subscribe →</span>
    </div>
  )
}

interface Props {
  onOpenPack: (packId: string) => void
  onLogout: () => void
  onSubscribeRequired: () => void
}

export default function PackLibrary({ onOpenPack, onLogout, onSubscribeRequired }: Props) {
  const [packs, setPacks] = useState<Pack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [createError, setCreateError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [subStatus, setSubStatus] = useState<{ status: string; trialEndsAt: string | null } | null>(null)
  const [justSubscribed, setJustSubscribed] = useState(false)

  useEffect(() => {
    // Detect Stripe checkout success return and clean the URL
    const params = new URLSearchParams(window.location.search)
    if (params.get('subscribed') === '1') {
      setJustSubscribed(true)
      window.history.replaceState({}, '', window.location.pathname)
    }

    listPacks()
      .then(setPacks)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))

    getSubscriptionStatus()
      .then((s) => setSubStatus({ status: s.status, trialEndsAt: s.trialEndsAt }))
      .catch(() => {})
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const pack = await createPack(newTitle.trim())
      setPacks((prev) => [...prev, pack])
      setNewTitle('')
      setShowCreate(false)
      onOpenPack(pack.id)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create pack')
    } finally {
      setCreating(false)
    }
  }

  async function handleLogout() {
    await logout().catch(() => {})
    onLogout()
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">My Packs</h1>
        <button className="btn-icon btn-sm" onClick={handleLogout}>Sign out</button>
      </div>

      {justSubscribed && (
        <div
          style={{
            padding: '0.6rem 1rem',
            background: 'var(--success-dim, #14532d)',
            color: 'var(--success, #86efac)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Subscribed! Your account will be updated shortly.</span>
          <button
            style={{ background: 'none', color: 'inherit', fontSize: '0.9rem', padding: '0 0.25rem' }}
            onClick={() => setJustSubscribed(false)}
          >
            ✕
          </button>
        </div>
      )}

      {subStatus && !justSubscribed && (
        <SubscriptionBanner
          status={subStatus.status}
          trialEndsAt={subStatus.trialEndsAt}
          onSubscribeRequired={onSubscribeRequired}
        />
      )}

      {loading && <p className="loading">Loading packs…</p>}
      {error && <p className="error-msg">{error}</p>}

      <div className="screen-body">
        {!loading && packs.length === 0 && (
          <div className="empty-state">
            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📦</p>
            <p>No packs yet. Create your first pack to get started.</p>
          </div>
        )}

        {packs.map((pack) => {
          const isShared = pack.ownerId === HOUSE_USER_ID
          return (
            <div key={pack.id} className="card card-clickable" onClick={() => onOpenPack(pack.id)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <div style={{ fontWeight: 600 }}>{pack.title}</div>
                    {isShared && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.1rem 0.4rem',
                          background: 'var(--accent-dim, #1e3a8a)',
                          color: 'var(--accent, #93c5fd)',
                          borderRadius: '0.25rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                        }}
                      >
                        Shared
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                    {pack.games.length} {pack.games.length === 1 ? 'game' : 'games'}
                    {' · '}
                    {pack.games.reduce((sum, g) => sum + g.questions.length, 0)} questions
                  </div>
                </div>
                <span style={{ color: 'var(--text-dim)', fontSize: '1.2rem' }}>›</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bottom-actions">
        {showCreate ? (
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="packTitle">Pack name</label>
              <input
                id="packTitle"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. 80s Movies Night"
                autoFocus
                maxLength={100}
              />
            </div>
            {createError && <p className="error-msg" style={{ marginBottom: '0.5rem' }}>{createError}</p>}
            <div className="action-row">
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={creating || !newTitle.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        ) : (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + New Pack
          </button>
        )}
      </div>
    </div>
  )
}
