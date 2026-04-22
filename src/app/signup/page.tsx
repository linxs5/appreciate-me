'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) return
    setSubmitting(true)
    try {
      await fetch('/.netlify/functions/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setSubmitted(true)
    } catch {
      setSubmitted(true)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a09', color: '#f2f0e8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }} className="fade-up">
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#00e87a', letterSpacing: '0.15em', marginBottom: 10 }}>
          — TRIANGLE AREA BETA
        </div>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 56, letterSpacing: '0.03em', lineHeight: 0.95, marginBottom: 14 }}>
          CLAIM YOUR SPOT
        </h1>
        <p style={{ fontSize: 15, color: '#b4b2a6', marginBottom: 32, lineHeight: 1.6 }}>
          50 founding member spots. Document your build. Prove your maintenance. Close the resale gap.
        </p>

        {submitted ? (
          <div style={{ background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.3)', borderRadius: 6, padding: '24px 20px' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: '#00e87a', letterSpacing: '0.03em', marginBottom: 8 }}>
              YOU&apos;RE ON THE LIST
            </div>
            <p style={{ fontSize: 14, color: '#b4b2a6', marginBottom: 20 }}>
              We&apos;ll email you when the beta opens. In the meantime, you can start building your garage right now.
            </p>
            <Link href="/app" style={{ background: '#00e87a', color: '#0a0a09', fontFamily: 'Bebas Neue, sans-serif', fontSize: 17, letterSpacing: '0.05em', padding: '12px 28px', borderRadius: 4, textDecoration: 'none', display: 'inline-block' }}>
              ENTER GARAGE →
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{ width: '100%', background: '#111110', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '14px 16px', fontSize: 15, color: '#f2f0e8', fontFamily: 'DM Sans, sans-serif', marginBottom: 12, outline: 'none' }}
            />
            <button type="submit" disabled={submitting} style={{ width: '100%', background: '#00e87a', color: '#0a0a09', border: 'none', fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: '0.05em', padding: '14px', borderRadius: 4, cursor: 'pointer', marginBottom: 16 }}>
              {submitting ? 'SUBMITTING...' : 'CLAIM MY SPOT →'}
            </button>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#6b6a63', letterSpacing: '0.08em' }}>
              NO PASSWORD NEEDED · ENTER GARAGE IMMEDIATELY
            </div>
          </form>
        )}

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <Link href="/app" style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#6b6a63', letterSpacing: '0.08em', textDecoration: 'none' }}>
            SKIP — GO STRAIGHT TO GARAGE →
          </Link>
        </div>
      </div>
    </div>
  )
}
