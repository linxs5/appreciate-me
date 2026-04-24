'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getVehicles, totalInvested, photoUrl } from '@/lib/api'
import type { Vehicle } from '@/lib/types'

export default function GaragePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getVehicles()
      .then((v) => setVehicles(v))
      .finally(() => setLoading(false))
  }, [])

  const totalSpend = vehicles.reduce((s, v) => s + totalInvested(v.entries), 0)
  const totalLogs = vehicles.reduce((s, v) => s + v.entries.length, 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)', padding: 0 }}>
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(10,10,9,0.9)', backdropFilter: 'blur(12px)', zIndex: 50 }}>
        <Link href="/" style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--off-white)', textDecoration: 'none', letterSpacing: '0.04em' }}>
          Appreciate<span style={{ color: 'var(--accent)' }}>.</span>Me
        </Link>

        <Link href="/app/vehicles/new" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
          + ADD VEHICLE
        </Link>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
            — GARAGE
          </div>

          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(36px,6vw,60px)', color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.02em' }}>
            YOUR GARAGE
          </h1>

          <p style={{ color: 'var(--gray)', fontSize: 14, marginTop: 6 }}>
            {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} tracked
          </p>
        </div>

        {!loading && vehicles.length > 0 && (
          <div className="fade-up delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 40 }}>
            {[
              { label: 'TOTAL INVESTED', value: `$${totalSpend.toLocaleString()}` },
              { label: 'VEHICLES', value: vehicles.length },
              { label: 'TOTAL LOGS', value: totalLogs },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '16px 20px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.12em', marginBottom: 8 }}>
                  {s.label}
                </div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: 'var(--off-white)', lineHeight: 1 }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
            LOADING GARAGE...
          </div>
        ) : vehicles.length === 0 ? (
          <div className="fade-in" style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: 'var(--gray)', marginBottom: 16 }}>
              NO VEHICLES YET
            </div>
            <p style={{ color: 'var(--gray)', marginBottom: 24, fontSize: 15 }}>
              Add your first vehicle to start building your documented history.
            </p>
            <Link href="/app/vehicles/new" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 500, padding: '12px 24px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
              + ADD YOUR FIRST VEHICLE
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 16 }}>
            {vehicles.map((v, i) => {
              const coverPhotoKey = v.coverPhotoKey || v.photoKeys?.[0]

              return (
                <Link
                  key={v.id}
                  href={`/app/vehicles/${v.id}`}
                  style={{ textDecoration: 'none' }}
                  className={`fade-up delay-${Math.min(i + 1, 6)}`}
                >
                  <div
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', transition: 'border-color 0.2s, transform 0.2s' }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,232,122,0.35)'
                      ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                      ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                    }}
                  >
                    <div style={{ height: 180, background: '#1a1a18', overflow: 'hidden' }}>
                      {coverPhotoKey ? (
                        <img src={photoUrl(coverPhotoKey)} alt={`${v.year} ${v.make} ${v.model}`} className="card-photo" loading="lazy" />
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.1em' }}>
                          NO PHOTO
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '16px 18px' }}>
                      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--off-white)', letterSpacing: '0.03em', marginBottom: 2 }}>
                        {v.year} {v.make} {v.model}
                      </div>

                      {v.trim && (
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)', marginBottom: 12 }}>
                          {v.trim}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 0' }}>
                        {[
                          { l: 'INVESTED', v: `$${totalInvested(v.entries).toLocaleString()}` },
                          { l: 'MILEAGE', v: `${v.mileage?.toLocaleString()} mi` },
                          { l: 'LOGS', v: `${v.entries.length} entries` },
                          { l: 'COLOR', v: v.color || '—' },
                        ].map((s, j) => (
                          <div key={j}>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.1em' }}>
                              {s.l}
                            </div>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--off-white)' }}>
                              {s.v}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
