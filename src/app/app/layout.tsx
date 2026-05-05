'use client'

import { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LiveActivityTicker from '@/components/LiveActivityTicker'
import { reportError } from '@/lib/api'
import { getCurrentUser, signOut } from '@/lib/auth'
import type { UserProfile } from '@/lib/types'

function sendErrorReport(message: string, stack?: string, extra?: unknown) {
  reportError({
    message,
    stack,
    page: typeof window !== 'undefined' ? window.location.pathname : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    extra,
    createdAt: new Date().toISOString(),
  }).catch(() => {})
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    sendErrorReport(error.message || 'Render error', error.stack, {
      componentStack: errorInfo.componentStack,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px 28px', color: 'var(--off-white)', fontFamily: 'DM Sans, sans-serif', fontSize: 15 }}>
            Something went wrong. This issue has been logged.
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isValuationLab = pathname.startsWith('/app/valuation')
  const isCommunity = pathname.startsWith('/app/community')
  const isProfile = pathname.startsWith('/app/profile')
  const isLogin = pathname.startsWith('/app/login')
  const isGarage = pathname === '/app' || pathname.startsWith('/app/vehicles')
  const [user, setUser] = useState<UserProfile | null>(null)

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => setUser(null))
  }, [pathname])

  async function handleSignOut() {
    await signOut().catch(() => {})
    setUser(null)
    window.location.href = '/app/login'
  }

  useEffect(() => {
    function handleWindowError(event: ErrorEvent) {
      sendErrorReport(event.message || 'Window error', event.error?.stack, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      })
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason
      const message = reason instanceof Error ? reason.message : 'Unhandled promise rejection'
      const stack = reason instanceof Error ? reason.stack : undefined
      sendErrorReport(message, stack, {
        reason: reason instanceof Error ? undefined : String(reason),
      })
    }

    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return (
    <div className="app-shell" style={{ minHeight: '100vh', background: 'var(--black)' }}>
      <style jsx global>{`
        :root {
          --app-nav-height: 56px;
        }

        .app-shell-nav {
          min-height: var(--app-nav-height);
        }

        .app-shell-nav-links {
          scrollbar-width: none;
        }

        .app-shell-nav-links::-webkit-scrollbar {
          display: none;
        }

        .app-shell-brand:focus-visible,
        .app-shell-nav-link:focus-visible {
          outline: 2px solid #00e87a;
          outline-offset: 3px;
          box-shadow: 0 0 0 5px rgba(0,232,122,0.12);
        }

        @media (max-width: 640px) {
          :root {
            --app-nav-height: 82px;
          }

          .app-shell-nav {
            align-items: flex-start !important;
            flex-direction: column !important;
            gap: 8px !important;
            padding: calc(env(safe-area-inset-top) + 10px) 12px 9px !important;
            min-height: calc(var(--app-nav-height) + env(safe-area-inset-top)) !important;
          }

          .app-shell-brand {
            font-size: 19px !important;
            flex: 0 0 auto;
          }

          .app-shell-nav-links {
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            justify-content: flex-start !important;
            gap: 6px !important;
            min-width: 0;
            max-width: 100%;
            padding-bottom: 2px;
          }

          .app-shell-nav-link {
            font-size: 9px !important;
            padding: 6px 8px !important;
            letter-spacing: 0.05em !important;
          }
        }
      `}</style>
      <nav className="app-shell-nav" style={{
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
        <Link href="/app" className="app-shell-brand" style={{
          fontFamily: 'Bebas Neue, sans-serif',
          fontSize: 22,
          color: 'var(--off-white)',
          textDecoration: 'none',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        }}>
          Appreciate<span style={{ color: 'var(--accent)' }}>.</span>Me
        </Link>

        <div className="app-shell-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {[
            { href: '/app', label: 'GARAGE', active: isGarage },
            { href: '/app/valuation', label: 'VALUATION LAB', active: isValuationLab },
            { href: '/app/community', label: 'COMMUNITY', active: isCommunity },
            { href: user ? '/app/profile' : '/app/login', label: user ? 'PROFILE' : 'LOGIN', active: isProfile || isLogin },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="app-shell-nav-link"
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
          {user && (
            <button
              type="button"
              onClick={handleSignOut}
              className="app-shell-nav-link"
              style={{
                color: 'var(--gray)',
                border: '1px solid transparent',
                background: 'transparent',
                borderRadius: 999,
                padding: '7px 12px',
                fontFamily: 'DM Mono, monospace',
                fontSize: 11,
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              SIGN OUT
            </button>
          )}
        </div>
      </nav>

      <LiveActivityTicker />

      <AppErrorBoundary>{children}</AppErrorBoundary>
    </div>
  )
}
