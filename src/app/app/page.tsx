'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { claimLegacyVehicle, getCommunityPosts, getLegacyVehicles, getVehicles, photoUrl, visualIdentityUrl } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import type { CommunityPost, UserProfile, Vehicle } from '@/lib/types'

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

const ONBOARDING_CHECKLIST_HIDDEN_KEY = 'appreciate-me.onboarding-checklist-hidden'
const PROOF_PACKET_OPENED_KEY = 'appreciate-me.onboarding-proof-packet-opened'

function formatCurrency(value: number) {
  return `$${Math.round(Math.abs(value)).toLocaleString()}`
}

function formatSignedCurrency(value: number) {
  if (value === 0) return '$0'
  return `${value > 0 ? '+' : '-'}${formatCurrency(value)}`
}

function financialTone(value: number) {
  if (value > 0) return '#00e87a'
  if (value < 0) return '#ff4d4f'
  return 'var(--gray)'
}

function confidenceTone(confidence: Confidence) {
  if (confidence === 'HIGH') return '#00e87a'
  if (confidence === 'MEDIUM') return '#f5a524'
  return '#ff4d4f'
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

function hasProofAttachment(vehicle: Vehicle) {
  return vehicle.entries.some(entry => (entry.attachments || []).length > 0)
}

function buildPostVehicleId(post: CommunityPost) {
  return post.vehicleId || post.buildVehicleId || ''
}

export default function GaragePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [legacyVehicles, setLegacyVehicles] = useState<Vehicle[]>([])
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([])
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [checklistHidden, setChecklistHidden] = useState(false)
  const [proofPacketOpened, setProofPacketOpened] = useState<Record<string, boolean>>({})

  useEffect(() => {
    getCurrentUser()
      .then(async (currentUser) => {
        setUser(currentUser)
        if (!currentUser) return
        const [owned, legacy, posts] = await Promise.all([
          getVehicles(),
          getLegacyVehicles(),
          getCommunityPosts().catch(() => [] as CommunityPost[]),
        ])
        setVehicles(owned)
        setLegacyVehicles(legacy)
        setCommunityPosts(posts)
      })
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    try {
      setChecklistHidden(window.localStorage.getItem(ONBOARDING_CHECKLIST_HIDDEN_KEY) === 'true')
      const savedProofPacketState = window.localStorage.getItem(PROOF_PACKET_OPENED_KEY)
      if (savedProofPacketState) setProofPacketOpened(JSON.parse(savedProofPacketState) || {})
    } catch {
      setChecklistHidden(false)
      setProofPacketOpened({})
    }
  }, [])

  async function handleClaimVehicle(id: string) {
    setClaimingId(id)
    try {
      const claimed = await claimLegacyVehicle(id)
      setVehicles(current => [claimed, ...current])
      setLegacyVehicles(current => current.filter(vehicle => vehicle.id !== id))
    } catch {
      alert('Failed to claim vehicle. It may have already been claimed.')
    } finally {
      setClaimingId(null)
    }
  }

  function setOnboardingHidden(hidden: boolean) {
    setChecklistHidden(hidden)
    try {
      window.localStorage.setItem(ONBOARDING_CHECKLIST_HIDDEN_KEY, hidden ? 'true' : 'false')
    } catch {}
  }

  function markProofPacketOpened(vehicleId: string) {
    setProofPacketOpened(current => {
      const next = { ...current, [vehicleId]: true }
      try {
        window.localStorage.setItem(PROOF_PACKET_OPENED_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const portfolioVehicles = vehicles.map((vehicle) => {
    const totalInvested = vehicle.entries.reduce((sum, entry) => sum + (entry.cost || 0), 0)
    const totalImpact = vehicle.entries.reduce((sum, entry) => sum + (entry.estimatedValueImpact || 0), 0)
    const netPosition = totalImpact - totalInvested
    const proofCount = vehicle.entries.reduce((sum, entry) => sum + (entry.attachments?.length || 0), 0)
    const logCount = vehicle.entries.length
    const buildPostCount = communityPosts.filter(post => buildPostVehicleId(post) === vehicle.id).length
    const marketComps = vehicle.marketComps || []
    const marketCompsCount = marketComps.length
    const soldCompsCount = marketComps.filter((c) => c.soldOrAsking === 'sold').length
    const soldPrices = marketComps
      .filter((c) => c.soldOrAsking === 'sold')
      .map((c) => c.price)
      .filter((price) => Number.isFinite(price))
    const allPrices = marketComps
      .map((c) => c.price)
      .filter((price) => Number.isFinite(price))
    const valuationPrices = soldPrices.length > 0 ? soldPrices : allPrices
    const estimatedMarketValue = median(valuationPrices)
    let confidence: Confidence = 'LOW'
    if (soldCompsCount >= 5) confidence = 'HIGH'
    else if (soldCompsCount >= 2) confidence = 'MEDIUM'

    return {
      vehicle,
      totalInvested,
      totalImpact,
      netPosition,
      proofCount,
      logCount,
      buildPostCount,
      marketCompsCount,
      soldCompsCount,
      estimatedMarketValue,
      confidence,
    }
  })

  const totalPortfolioValue = portfolioVehicles.reduce((sum, item) => sum + (item.estimatedMarketValue || 0), 0)
  const totalPortfolioInvested = portfolioVehicles.reduce((sum, item) => sum + item.totalInvested, 0)
  const totalProofFiles = portfolioVehicles.reduce((sum, item) => sum + item.proofCount, 0)
  const onboardingTarget = portfolioVehicles
    .slice()
    .sort((a, b) => {
      const aScore = [
        true,
        a.vehicle.photoKeys.length >= 3,
        !!a.vehicle.coverPhotoKey,
        a.logCount > 0,
        a.proofCount > 0,
        a.buildPostCount > 0,
        !!proofPacketOpened[a.vehicle.id],
      ].filter(Boolean).length
      const bScore = [
        true,
        b.vehicle.photoKeys.length >= 3,
        !!b.vehicle.coverPhotoKey,
        b.logCount > 0,
        b.proofCount > 0,
        b.buildPostCount > 0,
        !!proofPacketOpened[b.vehicle.id],
      ].filter(Boolean).length
      if (aScore !== bScore) return bScore - aScore
      return new Date(b.vehicle.createdAt).getTime() - new Date(a.vehicle.createdAt).getTime()
    })[0]
  const checklistVehicle = onboardingTarget?.vehicle
  const checklistVehicleHref = checklistVehicle ? `/app/vehicles/${checklistVehicle.id}` : '/app/vehicles/new'
  const proofPacketHref = checklistVehicle ? `/share/${checklistVehicle.id}` : '/app/vehicles/new'
  const checklistItems = [
    {
      label: 'Add your first vehicle',
      detail: 'Start the proof-backed garage with one car.',
      complete: vehicles.length > 0,
      href: '/app/vehicles/new',
      action: vehicles.length > 0 ? 'DONE' : 'ADD VEHICLE',
    },
    {
      label: 'Upload 3+ photos',
      detail: 'Give the garage enough visual context for buyer trust.',
      complete: (checklistVehicle?.photoKeys.length || 0) >= 3,
      href: checklistVehicleHref,
      action: 'OPEN VEHICLE',
    },
    {
      label: 'Set a cover photo',
      detail: 'Choose the image that anchors the buyer-ready proof packet.',
      complete: !!checklistVehicle?.coverPhotoKey,
      href: checklistVehicleHref,
      action: 'SET COVER',
    },
    {
      label: 'Add a proof/maintenance log',
      detail: 'Turn work done into documented vehicle history.',
      complete: (checklistVehicle?.entries.length || 0) > 0,
      href: checklistVehicleHref,
      action: 'ADD LOG',
    },
    {
      label: 'Attach a receipt, screenshot, or work photo',
      detail: 'Proof files make the record more than just a claim.',
      complete: checklistVehicle ? hasProofAttachment(checklistVehicle) : false,
      href: checklistVehicleHref,
      action: 'ADD PROOF',
    },
    {
      label: 'Create a build post',
      detail: 'Build in public. Prove the work.',
      complete: !!onboardingTarget && onboardingTarget.buildPostCount > 0,
      href: checklistVehicleHref,
      action: 'POST BUILD',
    },
    {
      label: 'Open/copy public proof packet',
      detail: 'See what a buyer-ready proof packet looks like.',
      complete: !!checklistVehicle && !!proofPacketOpened[checklistVehicle.id],
      href: proofPacketHref,
      action: 'OPEN PACKET',
      onClick: () => checklistVehicle && markProofPacketOpened(checklistVehicle.id),
    },
  ]
  const checklistCompleteCount = checklistItems.filter(item => item.complete).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)', padding: 0 }}>
      <style jsx global>{`
        .garage-page-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 36px 24px;
        }

        .garage-actions {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 24px;
        }

        .garage-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
          gap: 16px;
        }

        @media (max-width: 640px) {
          .garage-page-wrap {
            padding: 28px 14px 32px !important;
          }

          .garage-actions {
            justify-content: stretch !important;
          }

          .garage-actions a {
            width: 100%;
            text-align: center;
          }

          .garage-card-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }
      `}</style>
      <div className="garage-page-wrap">
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
            — GARAGE
          </div>

          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(36px,6vw,60px)', color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.02em' }}>
            ASSET PORTFOLIO
          </h1>

          <p style={{ color: 'var(--gray)', fontSize: 14, marginTop: 6 }}>
            {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} tracked across your automotive portfolio
          </p>
        </div>

        {user && (
          <div className="garage-actions">
            <Link href="/app/vehicles/new" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
              + ADD VEHICLE
            </Link>
          </div>
        )}

        {!loading && user && (
          checklistHidden ? (
            <div className="fade-up delay-1" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <button
                type="button"
                onClick={() => setOnboardingHidden(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: 0 }}
              >
                SHOW PROOF-BACKED GARAGE CHECKLIST
              </button>
            </div>
          ) : (
            <div className="fade-up delay-1" style={{ background: 'linear-gradient(135deg, #111110 0%, #080908 62%, rgba(0,232,122,0.07) 100%)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 10, padding: '18px 20px', marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>
                    — BETA LAUNCH CHECKLIST
                  </div>
                  <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.03em', marginBottom: 6 }}>
                    START YOUR PROOF-BACKED GARAGE
                  </h2>
                  <div style={{ color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.5, maxWidth: 680 }}>
                    Add the essentials that make your vehicle feel real: photos, proof, a build update, and a buyer-ready proof packet.
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 34, color: 'var(--accent)', lineHeight: 1 }}>
                    {checklistCompleteCount} / {checklistItems.length}
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.08em', marginBottom: 10 }}>
                    COMPLETE
                  </div>
                  <button
                    type="button"
                    onClick={() => setOnboardingHidden(true)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: 0 }}
                  >
                    HIDE CHECKLIST
                  </button>
                </div>
              </div>

              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ width: `${Math.round((checklistCompleteCount / checklistItems.length) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 999, transition: 'width 0.25s ease' }} />
              </div>

              {vehicles.length === 0 && (
                <div style={{ background: 'rgba(0,232,122,0.055)', border: '1px solid rgba(0,232,122,0.18)', borderRadius: 8, padding: '12px 13px', color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
                  Your garage is empty. Add one vehicle and this checklist will start filling itself in from real proof records.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 10 }}>
                {checklistItems.map((item, index) => (
                  <div key={item.label} style={{ background: item.complete ? 'rgba(0,232,122,0.06)' : 'rgba(255,255,255,0.026)', border: `1px solid ${item.complete ? 'rgba(0,232,122,0.24)' : 'rgba(255,255,255,0.075)'}`, borderRadius: 8, padding: '12px 13px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 999, background: item.complete ? 'var(--accent)' : 'transparent', border: `1px solid ${item.complete ? 'var(--accent)' : 'rgba(255,255,255,0.16)'}`, color: item.complete ? 'var(--black)' : 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        {item.complete ? '✓' : index + 1}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--off-white)', fontWeight: 600, fontSize: 14, lineHeight: 1.3, marginBottom: 4 }}>
                          {item.label}
                        </div>
                        <div style={{ color: 'var(--gray)', fontSize: 12, lineHeight: 1.45 }}>
                          {item.detail}
                        </div>
                      </div>
                    </div>
                    <Link
                      href={item.href}
                      onClick={item.onClick}
                      style={{ background: item.complete ? 'transparent' : 'rgba(0,232,122,0.1)', border: `1px solid ${item.complete ? 'rgba(255,255,255,0.12)' : 'rgba(0,232,122,0.36)'}`, color: item.complete ? 'var(--gray-light)' : 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 9, padding: '6px 8px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.06em', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      {item.action}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {!loading && vehicles.length > 0 && (
          <div className="fade-up delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 40 }}>
            {[
              { label: 'TOTAL VEHICLES', value: vehicles.length, tone: 'var(--off-white)' },
              { label: 'TOTAL ESTIMATED MARKET VALUE', value: formatCurrency(totalPortfolioValue), tone: 'var(--off-white)' },
              { label: 'TOTAL INVESTED', value: formatCurrency(totalPortfolioInvested), tone: 'var(--off-white)' },
              { label: 'TOTAL PROOF FILES', value: totalProofFiles, tone: 'var(--off-white)' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '16px 20px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.12em', marginBottom: 8 }}>
                  {s.label}
                </div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: s.tone, lineHeight: 1 }}>
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
        ) : !user ? (
          <div className="fade-in" style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 38, color: 'var(--gray)', marginBottom: 16 }}>
              SIGN IN REQUIRED
            </div>
            <p style={{ color: 'var(--gray)', marginBottom: 24, fontSize: 15 }}>
              Create an account or sign in to view your personal garage.
            </p>
            <Link href="/app/login" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, padding: '12px 20px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
              SIGN IN / SIGN UP
            </Link>
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
          <div className="garage-card-grid">
            {portfolioVehicles.map((item, i) => {
              const { vehicle: v } = item
              const visualIdentityKey = v.visualIdentity?.imageKey
              const coverPhotoKey = v.coverPhotoKey || v.photoKeys?.[0]
              const cardImageUrl = visualIdentityKey
                ? visualIdentityUrl(visualIdentityKey)
                : coverPhotoKey
                  ? photoUrl(coverPhotoKey)
                  : null

              return (
                <div
                  key={v.id}
                  className={`fade-up delay-${Math.min(i + 1, 6)}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', transition: 'border-color 0.2s, transform 0.2s', height: '100%', display: 'flex', flexDirection: 'column' }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,232,122,0.35)'
                      ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                      ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                    }}
                  >
                    <div style={{ height: 180, background: '#1a1a18', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {cardImageUrl ? (
                        <img src={cardImageUrl} alt={`${v.year} ${v.make} ${v.model}`} className="card-photo" loading="lazy" style={{ width: '100%', height: '100%', objectFit: visualIdentityKey ? 'contain' : 'cover', display: 'block', background: '#1a1a18' }} />
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

                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)', marginBottom: 14 }}>
                        {[v.trim, v.color, v.mileage ? `${v.mileage.toLocaleString()} mi` : null].filter(Boolean).join(' · ') || '—'}
                      </div>

                      <div style={{ background: 'linear-gradient(180deg, rgba(0,232,122,0.08) 0%, rgba(0,232,122,0.02) 100%)', border: '1px solid rgba(0,232,122,0.16)', borderRadius: 6, padding: '12px 14px', marginBottom: 14 }}>
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 6 }}>
                          ESTIMATED MARKET VALUE
                        </div>
                        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--off-white)', lineHeight: 1, marginBottom: 6 }}>
                          {item.estimatedMarketValue == null ? 'NO DATA' : formatCurrency(item.estimatedMarketValue)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: confidenceTone(item.confidence), letterSpacing: '0.08em' }}>
                            CONFIDENCE: {item.confidence}
                          </div>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.08em' }}>
                            SOLD COMPS: {item.soldCompsCount}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
                        {[
                          { l: 'TOTAL INVESTED', v: formatCurrency(item.totalInvested), tone: 'var(--off-white)' },
                          { l: 'NET POSITION', v: formatSignedCurrency(item.netPosition), tone: financialTone(item.netPosition) },
                          { l: 'PROOF FILES', v: String(item.proofCount), tone: 'var(--off-white)' },
                          { l: 'LOG RECORDS', v: String(item.logCount), tone: 'var(--off-white)' },
                          { l: 'MARKET COMPS', v: String(item.marketCompsCount), tone: 'var(--off-white)' },
                          { l: 'VALUE IMPACT', v: formatSignedCurrency(item.totalImpact), tone: financialTone(item.totalImpact) },
                        ].map((s, j) => (
                          <div key={j}>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.1em' }}>
                              {s.l}
                            </div>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: s.tone }}>
                              {s.v}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                        <Link href={`/app/vehicles/${v.id}`} style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 500, padding: '8px 12px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
                          OPEN BUILD
                        </Link>
                        <Link href={`/share/${v.id}`} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '8px 12px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
                          SHARE PACKET
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && user && legacyVehicles.length > 0 && (
          <div className="fade-up delay-2" style={{ marginTop: 44 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 12 }}>
              — LEGACY VEHICLES
            </div>
            <div style={{ background: 'rgba(245,165,36,0.07)', border: '1px solid rgba(245,165,36,0.22)', borderRadius: 8, padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.5 }}>
                These vehicles were created before accounts existed. Claim only vehicles that belong in your garage.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {legacyVehicles.map(vehicle => (
                <div key={vehicle.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: 'var(--off-white)', letterSpacing: '0.03em' }}>
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.06em' }}>
                      UNOWNED LEGACY RECORD
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClaimVehicle(vehicle.id)}
                    disabled={claimingId === vehicle.id}
                    style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '8px 12px', borderRadius: 4, cursor: claimingId === vehicle.id ? 'wait' : 'pointer', opacity: claimingId === vehicle.id ? 0.7 : 1, letterSpacing: '0.05em' }}
                  >
                    {claimingId === vehicle.id ? 'CLAIMING...' : 'CLAIM VEHICLE'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
