'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isValuationLab = pathname.startsWith('/app/valuation')
  const isGarage = pathname.startsWith('/app') && !isValuationLab

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '0 24px',
        minHeight: 56,
        background: 'rgba(10,10,9,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}>
        <Link href="/app" style={{
          fontFamily: 'Bebas Neue, sans-serif',
          fontSize: 22,
          color: 'var(--off-white)',
          textDecoration: 'none',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        }}>
          Appreciate<span style={{ color: 'var(--accent)' }}>.</span>Me
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {[
            { href: '/app', label: 'GARAGE', active: isGarage },
            { href: '/app/valuation', label: 'VALUATION LAB', active: isValuationLab },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                color: item.active ? '#00e87a' : 'var(--gray)',
                border: `1px solid ${item.active ? 'rgba(0,232,122,0.28)' : 'transparent'}`,
                background: item.active ? 'rgba(0,232,122,0.08)' : 'transparent',
                borderRadius: 999,
                padding: '7px 12px',
                fontFamily: 'DM Mono, monospace',
                fontSize: 11,
                letterSpacing: '0.08em',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {children}
    </div>
  )
}
