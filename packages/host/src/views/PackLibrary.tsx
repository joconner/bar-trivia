import { useState, useEffect, FormEvent } from 'react'
import type { Pack } from '@bar-trivia/shared'
import { listPacks, createPack, logout } from '../api'

interface Props {
  onOpenPack: (packId: string) => void
  onLogout: () => void
}

export default function PackLibrary({ onOpenPack, onLogout }: Props) {
  const [packs, setPacks] = useState<Pack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [createError, setCreateError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    listPacks()
      .then(setPacks)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
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

      {loading && <p className="loading">Loading packs…</p>}
      {error && <p className="error-msg">{error}</p>}

      <div className="screen-body">
        {!loading && packs.length === 0 && (
          <div className="empty-state">
            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📦</p>
            <p>No packs yet. Create your first pack to get started.</p>
          </div>
        )}

        {packs.map((pack) => (
          <div key={pack.id} className="card card-clickable" onClick={() => onOpenPack(pack.id)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{pack.title}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  {pack.games.length} {pack.games.length === 1 ? 'game' : 'games'}
                  {' · '}
                  {pack.games.reduce((sum, g) => sum + g.questions.length, 0)} questions
                </div>
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '1.2rem' }}>›</span>
            </div>
          </div>
        ))}
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
