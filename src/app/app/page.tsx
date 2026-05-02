'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { claimLegacyVehicle, getLegacyVehicles, getVehicles, photoUrl, visualIdentityUrl } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import type { UserProfile, Vehicle } from '@/lib/types'

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

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

export default function GaragePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [legacyVehicles, setLegacyVehicles] = useState<Vehicle[]>([])
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  useEffect(() => {
    getCurrentUser()
      .then(async (currentUser) => {
        setUser(currentUser)
        if (!currentUser) return
        const [owned, legacy] = await Promise.all([getVehicles(), getLegacyVehicles()])
        setVehicles(owned)
        setLegacyVehicles(legacy)
      })
      .finally(() => setLoading(false))
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

  const portfolioVehicles = vehicles.map((vehicle) => {
    const totalInvested = vehicle.entries.reduce((sum, entry) => sum + (entry.cost || 0), 0)
    const totalImpact = vehicle.entries.reduce((sum, entry) => sum + (entry.estimatedValueImpact || 0), 0)
    const netPosition = totalImpact - totalInvested
    const proofCount = vehicle.entries.reduce((sum, entry) => sum + (entry.attachments?.length || 0), 0)
    const logCount = vehicle.entries.length
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
      marketCompsCount,
      soldCompsCount,
      estimatedMarketValue,
      confidence,
    }
  })

  const totalPortfolioValue = portfolioVehicles.reduce((sum, item) => sum + (item.estimatedMarketValue || 0), 0)
  const totalPortfolioInvested = portfolioVehicles.reduce((sum, item) => sum + item.totalInvested, 0)
  const totalProofFiles = portfolioVehicles.reduce((sum, item) => sum + item.proofCount, 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)', padding: 0 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <Link href="/app/vehicles/new" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
              + ADD VEHICLE
            </Link>
          </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 16 }}>
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
