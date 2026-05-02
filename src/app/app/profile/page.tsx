'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCurrentUser, saveProfile } from '@/lib/auth'
import type { UserProfile } from '@/lib/types'

function friendlyProfileError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('taken')) return 'That username is already taken.'
  if (message.includes('at least 3')) return 'Username must be at least 3 characters.'
  return 'Could not save your profile. Please try again.'
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCurrentUser()
      .then(current => {
        setUser(current)
        setUsername(current?.username || '')
        setDisplayName(current?.displayName || '')
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const updated = await saveProfile({ username, displayName })
      setUser(updated)
      setUsername(updated.username)
      setDisplayName(updated.displayName || '')
      setStatus('Profile saved.')
    } catch (err) {
      setError(friendlyProfileError(err))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#111110',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--off-white)',
    padding: '12px 14px',
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 14,
    outline: 'none',
  }

  if (loading) {
    return <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', padding: 40 }}>LOADING PROFILE...</div>
  }

  if (!user) {
    return (
      <div style={{ minHeight: 'calc(100vh - var(--app-nav-height, 56px))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 38, color: 'var(--gray)', marginBottom: 12 }}>SIGN IN REQUIRED</div>
          <Link href="/app/login" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, padding: '11px 16px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.06em' }}>GO TO LOGIN</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: 'calc(100vh - var(--app-nav-height, 56px))', background: 'var(--black)' }}>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>
            — PROFILE
          </div>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 54, color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.03em' }}>
            ACCOUNT PROFILE
          </h1>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px 22px' }}>
          <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>EMAIL</label>
          <input value={user.email} readOnly style={{ ...inputStyle, color: 'var(--gray)' }} />

          <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.1em', display: 'block', margin: '16px 0 6px' }}>USERNAME</label>
          <input value={username} onChange={e => setUsername(e.target.value)} style={inputStyle} />

          <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.1em', display: 'block', margin: '16px 0 6px' }}>DISPLAY NAME</label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} placeholder="Optional" />

          {error && <div style={{ color: '#ff8080', fontSize: 13, marginTop: 14 }}>{error}</div>}
          {status && <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 14 }}>{status}</div>}

          <button onClick={handleSave} disabled={saving} style={{ marginTop: 20, background: 'var(--accent)', color: 'var(--black)', border: 'none', borderRadius: 4, padding: '11px 18px', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'SAVING...' : 'SAVE PROFILE'}
          </button>
        </div>
      </div>
    </div>
  )
}
