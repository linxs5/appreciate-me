'use client'
import { useEffect, useState } from 'react'
import { getPublicVehicle, photoUrl, visualIdentityUrl, attachmentUrl, totalInvested } from '@/lib/api'
import type { Vehicle, ConditionCheckup } from '@/lib/types'

function formatCurrency(value: number) {
  return `$${Math.round(value).toLocaleString()}`
}

function formatSignedCurrency(value: number) {
  if (value === 0) return '$0'
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function marketConfidenceTone(confidence: 'HIGH' | 'MEDIUM' | 'LOW') {
  if (confidence === 'HIGH') return '#00e87a'
  if (confidence === 'MEDIUM') return '#f5a524'
  return '#ff4d4f'
}

function marketBaselineLabel(percentDiff: number) {
  if (percentDiff > 10) return 'ABOVE MARKET BASELINE'
  if (percentDiff < -10) return 'BELOW MARKET BASELINE'
  return 'IN LINE WITH MARKET'
}

function marketBaselineTone(percentDiff: number) {
  if (percentDiff > 10) return '#00e87a'
  if (percentDiff < -10) return '#ff4d4f'
  return 'var(--gray-light)'
}

const conditionFieldLabelMap: Record<string, string> = {
  exterior: 'Exterior',
  interior: 'Interior',
  mechanical: 'Mechanical',
  titleStatus: 'Title',
  rust: 'Rust',
  leaks: 'Leaks',
  warningLights: 'Warning Lights',
  tires: 'Tires',
  brakes: 'Brakes',
  acHeat: 'AC / Heat',
  transmission: 'Transmission',
  frameCondition: 'Frame',
  paintCondition: 'Paint',
  interiorWear: 'Interior Wear',
  accidentHistory: 'Accident History',
  oemPartsKept: 'OEM Parts Kept',
  knownIssues: 'Known Issues',
  recentService: 'Recent Service',
  modifications: 'Modifications',
  notes: 'Notes',
}

const conditionValueLabelMap: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  clean: 'Clean',
  rebuilt: 'Rebuilt',
  salvage: 'Salvage',
  unknown: 'Unknown',
  none: 'None',
  minor: 'Minor',
  moderate: 'Moderate',
  severe: 'Severe',
  major: 'Major',
  check_engine: 'Check Engine',
  multiple: 'Multiple',
  new: 'New',
  worn: 'Worn',
  needs_replacement: 'Needs Replacement',
  needs_service: 'Needs Service',
  works: 'Works',
  partial: 'Partial',
  not_working: 'Not Working',
  smooth: 'Smooth',
  minor_issues: 'Minor Issues',
  major_issues: 'Major Issues',
  rusty: 'Rusty',
  minimal: 'Minimal',
  normal: 'Normal',
  heavy: 'Heavy',
  none_known: 'None Known',
}

function getConditionReadiness(conditionCheckup?: ConditionCheckup): 'STRONG' | 'MODERATE' | 'NEEDS ATTENTION' {
  const strongSignals = new Set(['excellent', 'good', 'none', 'works', 'smooth', 'clean', 'new', 'minimal', 'none_known'])
  const moderateSignals = new Set(['fair', 'minor', 'partial', 'worn', 'normal', 'unknown'])
  const weakSignals = new Set(['poor', 'severe', 'major', 'not_working', 'salvage', 'multiple', 'needs_replacement', 'needs_service', 'rusty', 'heavy', 'rebuilt', 'check_engine', 'moderate', 'major_issues', 'minor_issues'])

  let score = 0
  let completed = 0

  Object.entries(conditionCheckup || {}).forEach(([key, value]) => {
    if (key === 'updatedAt') return
    if (typeof value === 'boolean') {
      completed += 1
      score += value ? 1 : 0
      return
    }
    if (typeof value !== 'string' || value.trim() === '') return
    completed += 1
    if (strongSignals.has(value)) score += 1
    else if (weakSignals.has(value)) score -= 1
    else if (moderateSignals.has(value)) score += 0
  })

  if (completed === 0) return 'MODERATE'
  const average = score / completed
  if (average >= 0.35) return 'STRONG'
  if (average <= -0.2) return 'NEEDS ATTENTION'
  return 'MODERATE'
}

function conditionReadinessTone(readiness: 'STRONG' | 'MODERATE' | 'NEEDS ATTENTION') {
  if (readiness === 'STRONG') return '#00e87a'
  if (readiness === 'MODERATE') return '#f5a524'
  return '#ff4d4f'
}

function getCompletedConditionFields(conditionCheckup?: ConditionCheckup) {
  if (!conditionCheckup) return []
  return Object.entries(conditionCheckup)
    .filter(([key, value]) => {
      if (key === 'updatedAt') return false
      if (typeof value === 'boolean') return true
      return typeof value === 'string' && value.trim() !== ''
    })
    .map(([key, value]) => ({
      key,
      label: conditionFieldLabelMap[key] || key,
      value: typeof value === 'boolean'
        ? (value ? 'Yes' : 'No')
        : conditionValueLabelMap[value] || value,
      isLongText: ['knownIssues', 'recentService', 'modifications', 'notes'].includes(key),
    }))
}

export default function SharePage({ params }: { params: { vehicleId: string } }) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activePhoto, setActivePhoto] = useState<string | null>(null)

  useEffect(() => {
    getPublicVehicle(params.vehicleId)
      .then(v => {
        if (!v) setNotFound(true)
        else setVehicle(v)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
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
      <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, marginTop: 12 }}>This vehicle profile doesn&apos;t exist or has been removed.</div>
    </div>
  )

  const entries = vehicle.entries || []
  const invested = totalInvested(entries)
  const totalAttachments = entries.reduce((s, e) => s + (e.attachments?.length || 0), 0)
  const entriesWithProof = entries.filter(entry => (entry.attachments || []).length > 0)
  const recordsWithProof = entriesWithProof.length
  const recordsMissingProof = entries.length - recordsWithProof
  const proofCoverage = entries.length > 0 ? Math.round((recordsWithProof / entries.length) * 100) : 0
  const completedConditionFields = vehicle.shareConditionCheckup ? getCompletedConditionFields(vehicle.conditionCheckup) : []
  const conditionReadiness = getConditionReadiness(vehicle.conditionCheckup)
  const marketComps = vehicle.marketComps || []
  const soldPrices = marketComps
    .filter(comp => comp.soldOrAsking === 'sold')
    .map(comp => comp.price)
    .filter(price => Number.isFinite(price))
  const soldCompCount = marketComps.filter(c => c.soldOrAsking === 'sold').length
  const marketConfidence = soldCompCount >= 5 ? 'HIGH' : soldCompCount >= 2 ? 'MEDIUM' : 'LOW'
  const compPrices = soldPrices.length > 0
    ? soldPrices
    : marketComps
      .map(c => c.price)
      .filter(price => Number.isFinite(price))
  const compCount = compPrices.length
  const lowPrice = compCount ? Math.min(...compPrices) : null
  const highPrice = compCount ? Math.max(...compPrices) : null
  const averagePrice = compCount ? compPrices.reduce((sum, price) => sum + price, 0) / compCount : null
  const medianPrice = median(compPrices)
  const bookValue = typeof vehicle.bookValue === 'number' && Number.isFinite(vehicle.bookValue) && vehicle.bookValue > 0 ? vehicle.bookValue : null
  const estimatedMarketValue = medianPrice
  const marketBookDifference = bookValue != null && estimatedMarketValue != null ? estimatedMarketValue - bookValue : null
  const marketBookPercentDiff = bookValue != null && marketBookDifference != null ? Math.round((marketBookDifference / bookValue) * 100) : null
  const latestCompMs = marketComps.reduce((latest, comp) => {
    const time = new Date(comp.dateAdded).getTime()
    return !isNaN(time) && time > latest ? time : latest
  }, 0)
  const valuationUpdatedLabel = latestCompMs > 0
    ? new Date(latestCompMs).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—'

  // Proof Packet aggregates — all defensive
  const recordCount = entries.length
  const spend = invested

  // Last updated: newest entry.date OR attachment.uploadedAt
  let latestMs = 0
  for (const e of entries) {
    if (e.date) {
      const t = new Date(e.date).getTime()
      if (!isNaN(t) && t > latestMs) latestMs = t
    }
    for (const a of e.attachments || []) {
      if (a.uploadedAt) {
        const t = new Date(a.uploadedAt).getTime()
        if (!isNaN(t) && t > latestMs) latestMs = t
      }
    }
  }
  const lastUpdatedLabel = latestMs > 0
    ? new Date(latestMs).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—'

  // Hero source
  const coverPhotoKey = vehicle.coverPhotoKey || vehicle.photoKeys?.[0] || null
  const visualIdentityKey = vehicle.visualIdentity?.imageKey
  const heroKey = activePhoto || coverPhotoKey
  const heroImageSrc = activePhoto
    ? photoUrl(activePhoto)
    : visualIdentityKey
      ? visualIdentityUrl(visualIdentityKey)
      : heroKey
        ? photoUrl(heroKey)
        : null
  const galleryKeys = vehicle.photoKeys || []
  const hasGallery = galleryKeys.length > 1

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(10,10,9,0.95)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <a href="https://appreciateme.netlify.app" style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--off-white)', textDecoration: 'none' }}>
          Appreciate<span style={{ color: 'var(--accent)' }}>.</span>Me
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.3)', borderRadius: 4, padding: '5px 10px' }}>
          <span style={{ color: 'var(--accent)', fontSize: 12 }}>✓</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.08em' }}>VERIFIED BY APPRECIATE ME</span>
        </div>
      </nav>

      {/* Hero photo */}
      {heroImageSrc && (
        <div className="scale-in" style={{ background: '#0e0e0d' }}>
          <img
            src={heroImageSrc}
            alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            className="hero-photo"
            style={{ maxHeight: 500 }}
          />
        </div>
      )}

      {/* Public gallery */}
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
                      width: 96,
                      height: 68,
                      padding: 0,
                      borderRadius: 4,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      background: '#0e0e0d',
                      border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                      transition: 'border-color 0.15s',
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
        <div className="fade-up" style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— BUILD PROFILE</div>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(32px,6vw,56px)', color: 'var(--off-white)', letterSpacing: '0.03em', lineHeight: 1, marginBottom: 8 }}>
            {vehicle.year} {vehicle.make.toUpperCase()} {vehicle.model.toUpperCase()}
          </h1>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--gray)' }}>
            {[vehicle.trim, vehicle.color, vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : null].filter(Boolean).join(' · ')}
          </div>
          {vehicle.vin && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)', marginTop: 6 }}>VIN: {vehicle.vin}</div>}
        </div>

        {/* ─── VERIFIED PROOF PACKET ─── buyer-facing summary */}
        <div className="fade-up delay-1" style={{
          marginBottom: 28,
          background: 'linear-gradient(180deg, rgba(0,232,122,0.08) 0%, rgba(0,232,122,0.02) 100%)',
          border: '1px solid rgba(0,232,122,0.25)',
          borderRadius: 8,
          padding: '22px 22px 20px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Accent stripe */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--accent)' }} />

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--black)', fontWeight: 700, fontSize: 14,
                flexShrink: 0,
              }}>
                ✓
              </div>
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.18em', marginBottom: 2 }}>
                  — VERIFIED
                </div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--off-white)', letterSpacing: '0.04em', lineHeight: 1 }}>
                  PROOF PACKET
                </div>
              </div>
            </div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray-light)', letterSpacing: '0.1em', textAlign: 'right' }}>
              LAST UPDATED<br />
              <span style={{ color: 'var(--off-white)', fontSize: 12, letterSpacing: '0.05em' }}>
                {lastUpdatedLabel.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Metric grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
            {[
              { value: recordCount.toLocaleString(), label: recordCount === 1 ? 'SERVICE RECORD' : 'SERVICE RECORDS' },
              { value: totalAttachments.toLocaleString(), label: totalAttachments === 1 ? 'PROOF FILE' : 'PROOF FILES' },
              { value: `$${spend.toLocaleString()}`, label: 'DOCUMENTED SPEND' },
            ].map((m, i) => (
              <div key={i} style={{ background: '#0a0a09', padding: '14px 16px' }}>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, color: 'var(--off-white)', lineHeight: 1, marginBottom: 6, letterSpacing: '0.02em' }}>
                  {m.value}
                </div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.12em' }}>
                  {m.label}
                </div>
              </div>
            ))}
          </div>

          {/* Trust footer */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray-light)', letterSpacing: '0.05em', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--accent)' }}>◆</span>
            <span>Every record and file below was logged and timestamped by the owner.</span>
          </div>
        </div>

        {vehicle.shareConditionCheckup === true && completedConditionFields.length > 0 && (
          <div className="fade-up delay-1" style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 16 }}>— CONDITION SNAPSHOT</div>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.1em', color: conditionReadinessTone(conditionReadiness) }}>
                  CONDITION READINESS: {conditionReadiness}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
                {completedConditionFields.map(field => (
                  <div key={field.key} style={field.isLongText ? { gridColumn: '1 / -1' } : undefined}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 4 }}>
                      {field.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--off-white)', lineHeight: field.isLongText ? 1.6 : 1.4 }}>
                      {field.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Proof Vault */}
        <div className="fade-up delay-1" style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— PROOF VAULT</div>
          <div style={{ color: 'var(--gray)', fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
            Your Proof Vault stores receipts, photos, and documents that support this vehicle&apos;s history and value.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'PROOF COVERAGE', value: `${proofCoverage}%` },
              { label: 'TOTAL PROOF FILES', value: String(totalAttachments) },
              { label: 'RECORDS WITH PROOF', value: String(recordsWithProof) },
              { label: 'RECORDS MISSING PROOF', value: String(recordsMissingProof) },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--off-white)', lineHeight: 1 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.22)', borderRadius: 8, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--off-white)', letterSpacing: '0.03em', marginBottom: 4 }}>
              TRANSFER PACKET READY
            </div>
            <div style={{ color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.5 }}>
              When this vehicle is sold, this proof packet can be shared with the next owner.
            </div>
          </div>

          {entriesWithProof.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {entriesWithProof.map(entry => {
                const attachments = entry.attachments || []
                return (
                  <div key={entry.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                      <div style={{ color: 'var(--off-white)', fontWeight: 600, fontSize: 14 }}>{entry.title}</div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.06em' }}>
                        {new Date(entry.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {attachments.map(attachment => {
                        const url = attachmentUrl(attachment.key)
                        const isImage = attachment.type.startsWith('image/')
                        if (isImage) {
                          return (
                            <a key={attachment.key} href={url} target="_blank" rel="noopener noreferrer" title={attachment.name} style={{ display: 'block', width: 72, height: 72, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)', background: '#0e0e0d' }}>
                              <img src={url} alt={attachment.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            </a>
                          )
                        }
                        return (
                          <a key={attachment.key} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#0e0e0d', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 10px', color: 'var(--off-white)', textDecoration: 'none', maxWidth: 260 }}>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)' }}>{attachment.type === 'application/pdf' ? 'PDF' : 'FILE'}</span>
                            <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</span>
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Market-based valuation */}
        <div className="fade-up delay-1" style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 16 }}>— MARKET-BASED VALUATION</div>

          {compCount === 0 || medianPrice == null ? (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '22px 18px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--gray)', letterSpacing: '0.1em' }}>NO MARKET DATA AVAILABLE</div>
            </div>
          ) : (
            <>
              <div style={{
                marginBottom: 16,
                background: 'linear-gradient(180deg, rgba(0,232,122,0.08) 0%, rgba(0,232,122,0.02) 100%)',
                border: '1px solid rgba(0,232,122,0.2)',
                borderRadius: 8,
                padding: '20px 22px',
              }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.12em', marginBottom: 6 }}>
                  ESTIMATED MARKET VALUE
                </div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(36px,6vw,52px)', color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.03em', marginBottom: 6 }}>
                  {formatCurrency(medianPrice)}
                </div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray-light)', letterSpacing: '0.06em' }}>
                  Based on {compCount} real market comp{compCount === 1 ? '' : 's'}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray-light)', letterSpacing: '0.06em' }}>
                  <div>Estimated Range: {lowPrice == null || highPrice == null ? '—' : `${formatCurrency(lowPrice)} - ${formatCurrency(highPrice)}`}</div>
                  <div>Last Updated: {valuationUpdatedLabel}</div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', color: marketConfidenceTone(marketConfidence) }}>
                      MARKET CONFIDENCE: {marketConfidence}
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.08em' }}>
                      SOLD COMPS USED: {soldCompCount}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {[
                      { label: 'LOW: 0-1 sold comps', level: 'LOW' as const },
                      { label: 'MEDIUM: 2-4 sold comps', level: 'MEDIUM' as const },
                      { label: 'HIGH: 5+ sold comps', level: 'HIGH' as const },
                    ].map(scale => (
                      <div key={scale.label} style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: 9,
                        letterSpacing: '0.06em',
                        color: scale.level === marketConfidence ? marketConfidenceTone(scale.level) : 'var(--gray)',
                        border: `1px solid ${scale.level === marketConfidence ? marketConfidenceTone(scale.level) : 'rgba(255,255,255,0.08)'}`,
                        background: scale.level === marketConfidence ? 'rgba(255,255,255,0.02)' : 'transparent',
                        borderRadius: 999,
                        padding: '4px 7px',
                      }}>
                        {scale.label}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.5 }}>
                    Confidence is based on the number of SOLD comps used. Asking listings are shown for context but do not drive valuation when sold comps exist.
                  </div>
                </div>
              </div>

              {bookValue != null && estimatedMarketValue != null && marketBookDifference != null && marketBookPercentDiff != null && (
                <div style={{
                  marginBottom: 16,
                  background: 'var(--card-bg)',
                  border: `1px solid ${marketBaselineTone(marketBookPercentDiff)}`,
                  borderRadius: 8,
                  padding: '18px 20px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.12em' }}>
                      MARKET VS BOOK VALUE
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: marketBaselineTone(marketBookPercentDiff), letterSpacing: '0.08em' }}>
                      {marketBaselineLabel(marketBookPercentDiff)}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 12 }}>
                    {[
                      { l: 'BOOK VALUE (INDUSTRY)', v: formatCurrency(bookValue), tone: 'var(--gray-light)' },
                      { l: 'MARKET VALUE (REAL SALES)', v: formatCurrency(estimatedMarketValue), tone: 'var(--off-white)' },
                      { l: 'DIFFERENCE', v: `${formatSignedCurrency(marketBookDifference)} (${marketBookPercentDiff > 0 ? '+' : ''}${marketBookPercentDiff}%)`, tone: marketBaselineTone(marketBookPercentDiff) },
                    ].map(item => (
                      <div key={item.l}>
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 6 }}>{item.l}</div>
                        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: item.tone, lineHeight: 1, letterSpacing: '0.03em' }}>{item.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.5 }}>
                    Industry book values are based on national transaction data. Market value reflects real comparable sales.
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { l: 'LOW', v: lowPrice == null ? '—' : formatCurrency(lowPrice) },
                  { l: 'MEDIAN', v: formatCurrency(medianPrice) },
                  { l: 'AVERAGE', v: averagePrice == null ? '—' : formatCurrency(averagePrice) },
                  { l: 'HIGH', v: highPrice == null ? '—' : formatCurrency(highPrice) },
                ].map((stat) => (
                  <div key={stat.l} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px' }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 6 }}>{stat.l}</div>
                    <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--off-white)', lineHeight: 1 }}>{stat.v}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {marketComps
                  .slice()
                  .sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime())
                  .map((comp) => (
                    <div key={comp.id} style={{
                      background: comp.soldOrAsking === 'sold' ? 'rgba(0,232,122,0.04)' : 'var(--card-bg)',
                      border: `1px solid ${comp.soldOrAsking === 'sold' ? 'rgba(0,232,122,0.22)' : 'var(--border)'}`,
                      borderRadius: 6,
                      padding: '14px 16px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                            <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 500, fontSize: 14, color: 'var(--off-white)' }}>{comp.source}</span>
                            <span style={{
                              fontFamily: 'DM Mono, monospace',
                              fontSize: 9,
                              letterSpacing: '0.1em',
                              padding: '3px 7px',
                              borderRadius: 3,
                              whiteSpace: 'nowrap',
                              background: comp.soldOrAsking === 'sold' ? 'rgba(0,232,122,0.12)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${comp.soldOrAsking === 'sold' ? 'rgba(0,232,122,0.35)' : 'rgba(255,255,255,0.08)'}`,
                              color: comp.soldOrAsking === 'sold' ? 'var(--accent)' : 'var(--gray-light)',
                            }}>
                              {comp.soldOrAsking.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 6, fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                            <span style={{ color: 'var(--off-white)' }}>Price: {formatCurrency(comp.price)}</span>
                            <span style={{ color: 'var(--gray)' }}>Mileage: {comp.mileage == null ? '—' : `${comp.mileage.toLocaleString()} mi`}</span>
                          </div>
                          {comp.notes && <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.5, marginBottom: comp.url ? 6 : 0 }}>{comp.notes}</div>}
                          {comp.url && (
                            <a href={comp.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', letterSpacing: '0.05em' }}>
                              VIEW LISTING →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>

        {/* Stats (existing — kept) */}
        <div className="fade-up delay-1" style={{ marginBottom: 36 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { l: 'DOCUMENTED INVESTMENT', v: `$${invested.toLocaleString()}` },
              { l: 'MILEAGE', v: vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : '—' },
              { l: 'LOG ENTRIES', v: `${entries.length}` },
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
              <div style={{ fontSize: 13, color: 'var(--gray-light)' }}>This vehicle&apos;s maintenance and build history has been logged and timestamped by the owner.</div>
            </div>
          </div>
        </div>

        {/* Build log */}
        <div className="fade-up delay-2">
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 16 }}>— COMPLETE BUILD LOG ({entries.length} ENTRIES)</div>
          {entries.length === 0 ? (
            <div style={{ padding: '32px 0', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.08em', textAlign: 'center' }}>
              NO LOG ENTRIES YET
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entries.map((entry, i) => {
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

                    {/* Attachments — read-only */}
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
