import Link from 'next/link'

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
      <div className="fade-up" style={{ maxWidth: 520 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 56, letterSpacing: '0.04em', lineHeight: 0.95, marginBottom: 16 }}>
          APPRECIATE<span style={{ color: 'var(--accent)' }}>.</span>ME
        </div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)', letterSpacing: '0.15em', marginBottom: 24 }}>
          — THE GARAGE APP
        </div>
        <p style={{ fontSize: 15, color: 'var(--gray-light)', lineHeight: 1.7, marginBottom: 32 }}>
          Document your build. Prove your maintenance. Close the resale gap.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/app" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'Bebas Neue, sans-serif', fontSize: 17, letterSpacing: '0.05em', padding: '12px 24px', borderRadius: 4, textDecoration: 'none' }}>
            ENTER GARAGE →
          </Link>
          <a href="https://appreciateme.netlify.app" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 12, padding: '12px 22px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
            LEARN MORE
          </a>
        </div>
      </div>
    </div>
  )
}
