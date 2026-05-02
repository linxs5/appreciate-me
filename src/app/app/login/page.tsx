'use client'

import { useState } from 'react'
import { signIn, signUp } from '@/lib/auth'

type Mode = 'login' | 'signup'

function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('already exists')) return 'An account already exists for that email.'
  if (message.includes('Invalid email or password')) return 'Invalid email or password.'
  if (message.includes('8+')) return 'Use a valid email and a password with at least 8 characters.'
  return 'Something went wrong. Please try again.'
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (mode === 'signup') await signUp(email, password)
      else await signIn(email, password)
      window.location.href = '/app'
    } catch (err) {
      setError(friendlyAuthError(err))
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

  return (
    <div style={{ minHeight: 'calc(100vh - var(--app-nav-height, 56px))', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>
            — ACCOUNT
          </div>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 52, color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.03em' }}>
            {mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}
          </h1>
          <p style={{ color: 'var(--gray)', fontSize: 14, marginTop: 8 }}>
            Personal garages keep your vehicles, proof, and owner-side data scoped to you.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px 22px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {[
              { label: 'SIGN IN', value: 'login' as const },
              { label: 'SIGN UP', value: 'signup' as const },
            ].map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => { setMode(option.value); setError('') }}
                style={{ flex: 1, background: mode === option.value ? 'rgba(0,232,122,0.1)' : 'transparent', border: `1px solid ${mode === option.value ? 'rgba(0,232,122,0.35)' : 'var(--border)'}`, color: mode === option.value ? 'var(--accent)' : 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 10px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.08em' }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>EMAIL</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} autoComplete="email" />

          <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.1em', display: 'block', margin: '16px 0 6px' }}>PASSWORD</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} style={inputStyle} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />

          {error && (
            <div style={{ marginTop: 14, background: 'rgba(255,77,79,0.08)', border: '1px solid rgba(255,77,79,0.25)', borderRadius: 6, color: '#ff8080', padding: '10px 12px', fontSize: 13 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={saving} style={{ width: '100%', marginTop: 18, background: 'var(--accent)', color: 'var(--black)', border: 'none', borderRadius: 4, padding: '12px 16px', fontFamily: 'Bebas Neue, sans-serif', fontSize: 19, letterSpacing: '0.05em', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'WORKING...' : mode === 'signup' ? 'CREATE GARAGE' : 'SIGN IN'}
          </button>
        </form>
        <div style={{ marginTop: 18, textAlign: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em' }}>
          PUBLIC SHARE PAGES DO NOT REQUIRE LOGIN
        </div>
      </div>
    </div>
  )
}
