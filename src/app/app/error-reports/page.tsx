'use client'

import { useEffect, useState } from 'react'
import { getErrorReports, type ErrorReport } from '@/lib/api'

export default function ErrorReportsPage() {
  const [reports, setReports] = useState<ErrorReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getErrorReports()
      .then(setReports)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>
            — INTERNAL
          </div>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(34px,6vw,56px)', color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.03em' }}>
            ERROR REPORTS
          </h1>
        </div>

        {loading ? (
          <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, padding: '40px 0' }}>
            LOADING REPORTS...
          </div>
        ) : reports.length === 0 ? (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '24px 20px', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.08em' }}>
            NO ERROR REPORTS YET.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reports.map((report, index) => (
              <div key={report.id || `${report.createdAt}-${index}`} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div style={{ color: 'var(--off-white)', fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 600 }}>
                    {report.message}
                  </div>
                  <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.06em' }}>
                    {new Date(report.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: report.stack ? 10 : 0 }}>
                  <div>
                    <div style={{ color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.1em', marginBottom: 4 }}>PAGE</div>
                    <div style={{ color: 'var(--gray-light)', fontSize: 12 }}>{report.page || '—'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.1em', marginBottom: 4 }}>USER AGENT</div>
                    <div style={{ color: 'var(--gray-light)', fontSize: 12, lineHeight: 1.4 }}>{report.userAgent || '—'}</div>
                  </div>
                </div>
                {report.stack && (
                  <pre style={{ margin: 0, background: '#0e0e0d', border: '1px solid var(--border)', borderRadius: 6, padding: 12, color: 'var(--gray-light)', fontSize: 11, lineHeight: 1.45, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                    {report.stack}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
