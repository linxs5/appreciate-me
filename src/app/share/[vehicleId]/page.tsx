'use client'
import { useEffect, useState } from 'react'
import { getPublicVehicle, photoUrl, attachmentUrl, totalInvested } from '@/lib/api'
import type { Vehicle } from '@/lib/types'

export default function SharePage({ params }: { params: { vehicleId: string } }) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activePhoto, setActivePhoto] = useState<string | null>(null)

  useEffect(() => {
    getPublicVehicle(params.vehicleId).then(v => {
      if (!v) setNotFound(true)
      else setVehicle(v)
      setLoading(false)
    })
  }, [params.vehicleId])

  const badgeClass: Record<string, string> = { mod: 'badge-mod', maintenance: 'badge-maintenance', repair: 'badge-repair' }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.1em' }}>LOADING...</div>
    </div>
  )
  if (notFound || !vehicle) return (
    <div style={{ minHeight: '100vh', background: 'var(--black)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 48, color: 'var(--gray)', letterSpacing: '0.05em' }}>NOT FOUND</div>
      <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, marginTop: 12 }}>This vehicle profile doesn't exist or has been removed.</div>
    </div>
  )

  const invested = totalInvested(vehicle.entries)
  const totalAttachments = vehicle.entries.reduce((s, e) => s + (e.attachments?.length || 0), 0)

  // Cover photo logic — coverPhotoKey wins, fallback to first photo
  const coverPhotoKey =
    (vehicle as any).coverPhotoKey || vehicle.photoKeys?.[0] || null
  const heroKey = activePhoto || coverPhotoKey
  const galleryKeys = vehicle.photoKeys || []
  const hasGallery = galleryKeys.length > 1

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(10,10,9,0.95)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <a href="https://appreciateme.netlify.app" style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--off-white)', textDecoration: 'none' }}>
          Appreciate<span style={{ color: 'var(--accent)' }}>.</span>Me
        </a>
        {/* Verified badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.3)', borderRadius: 4, padding: '5px 10px' }}>
          <span style={{ color: 'var(--accent)', fontSize: 12 }}>✓</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.08em' }}>VERIFIED BY APPRECIATE ME</span>
        </div>
      </nav>

      {/* Hero photo */}
      {heroKey && (
        <div className="scale-in" style={{ background: '#0e0e0d' }}>
          <img
            src={photoUrl(heroKey)}
            alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            className="hero-photo"
            style={{ maxHeight: 500 }}
          />
        </div>
      )}

      {/* Public gallery — read-only, only when more than one photo */}
      {hasGallery && (
        <div style={{ borderBottom: '1px solid var(--border)', background: '#0c0c0b' }}>
          <div style={{ maxWidth: 860, margin: '0 auto', padding: '14px 24px' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.12em', marginBottom: 10 }}>
              — {galleryKeys.length} PHOTOS
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {galleryKeys.map(key => {
                const isActive = key === heroKey
                return (
                  <button
                    key={key}
                    onClick={() => setActivePhoto(key)}
                    style={{
                      flexShrink: 0,
                      width: 88,
                      height: 64,
                      padding: 0,
                      borderRadius: 4,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      background: '#0e0e0d',
                      border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                      transition: 'border-color 0.2s, transform 0.15s',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,232,122,0.4)' }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                    aria-label={isActive ? 'Current photo' : 'View photo'}
                  >
                    <img
                      src={photoUrl(key)}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '36px 24px' }}>
        {/* Vehicle title */}
        <div className="fade-up" style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— BUILD PROFILE</div>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(32px,6vw,56px)', color: 'var(--off-white)', letterSpacing: '0.03em', lineHeight: 1, marginBottom: 8 }}>
            {vehicle.year} {vehicle.make.toUpperCase()} {vehicle.model.toUpperCase()}
          </h1>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--gray)' }}>
            {[vehicle.trim, vehicle.color, vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : null].filter(Boolean).join(' · ')}
          </div>
          {vehicle.vin && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)', marginTop: 6 }}>VIN: {vehicle.vin}</div>}
        </div>

        {/* Stats + equity number */}
        <div className="fade-up delay-1" style={{ marginBottom: 36 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { l: 'DOCUMENTED INVESTMENT', v: `$${invested.toLocaleString()}` },
              { l: 'MILEAGE', v: vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : '—' },
              { l: 'LOG ENTRIES', v: `${vehicle.entries.length}` },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 6 }}>{s.l}</div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--off-white)', lineHeight: 1 }}>{s.v}</div>
              </div>
            ))}
          </div>
          {/* Proof callout */}
          <div style={{ background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 6, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'var(--accent)', fontSize: 18 }}>✓</span>
            <div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 2 }}>
                DOCUMENTED HISTORY{totalAttachments > 0 ? ` · ${totalAttachments} PROOF FILE${totalAttachments === 1 ? '' : 'S'}` : ''}
              </div>
              <div style={{ fontSize: 13, color: 'var(--gray-light)' }}>This vehicle's maintenance and build history has been logged and timestamped by the owner.</div>
            </div>
          </div>
        </div>

        {/* Build log */}
        <div className="fade-up delay-2">
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 16 }}>— COMPLETE BUILD LOG ({vehicle.entries.length} ENTRIES)</div>
          {vehicle.entries.length === 0 ? (
            <div style={{ padding: '32px 0', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.08em', textAlign: 'center' }}>
              NO LOG ENTRIES YET
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vehicle.entries.map((entry, i) => {
                const attachments = entry.attachments || []
                return (
                  <div key={entry.id} className={`fade-up delay-${Math.min(i+1,6)}`}
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1 }}>
                        <span className={`${badgeClass[entry.type]}`} style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.08em', padding: '3px 7px', borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>
                          {entry.type.toUpperCase()}
                        </span>
                        <div>
                          <div style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 500, fontSize: 14, color: 'var(--off-white)', marginBottom: 2 }}>{entry.title}</div>
                          {entry.description && <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.5, marginBottom: 4 }}>{entry.description}</div>}
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)' }}>
                            {new Date(entry.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      </div>
                      {entry.cost > 0 && (
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 15, color: 'var(--off-white)', fontWeight: 500, flexShrink: 0 }}>
                          ${entry.cost.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Attachments (read-only) */}
                    {attachments.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <span style={{ color: 'var(--accent)', fontSize: 11 }}>✓</span>
                          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.12em' }}>
                            PROOF ATTACHED ({attachments.length})
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {attachments.map(a => {
                            const isImage = a.type.startsWith('image/')
                            const url = attachmentUrl(a.key)
                            if (isImage) {
                              return (
                                <a key={a.key} href={url} target="_blank" rel="noopener noreferrer"
                                  title={a.name}
                                  style={{ display: 'block', width: 72, height: 72, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)', background: '#0e0e0d', flexShrink: 0 }}>
                                  <img src={url} alt={a.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                </a>
                              )
                            }
                            return (
                              <a key={a.key} href={url} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#0e0e0d', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 12px', textDecoration: 'none', maxWidth: 280 }}>
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.06em', flexShrink: 0 }}>
                                  {a.type === 'application/pdf' ? 'PDF' : 'FILE'}
                                </span>
                                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--off-white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {a.name}
                                </span>
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', flexShrink: 0 }}>
                                  VIEW →
                                </span>
                              </a>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="fade-up delay-3" style={{ marginTop: 48, textAlign: 'center', paddingTop: 40, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.12em', marginBottom: 12 }}>APPRECIATE ME — AUTOMOTIVE DOCUMENTATION</div>
          <a href="https://appreciateme.netlify.app" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: '0.05em', padding: '12px 28px', borderRadius: 4, textDecoration: 'none', display: 'inline-block' }}>
            DOCUMENT YOUR BUILD →
          </a>
        </div>
      </div>
    </div>
  )
}
