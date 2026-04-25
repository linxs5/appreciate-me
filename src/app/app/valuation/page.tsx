'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getVehicles, photoUrl } from '@/lib/api'
import type { Vehicle } from '@/lib/types'

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

function formatCurrency(value: number) {
  return `$${Math.round(Math.abs(value)).toLocaleString()}`
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

export default function ValuationLabPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getVehicles()
      .then((v) => setVehicles(v))
      .finally(() => setLoading(false))
  }, [])

  const valuationVehicles = vehicles.map((vehicle) => {
    const marketComps = vehicle.marketComps || []
    const soldPrices = marketComps
      .filter((comp) => comp.soldOrAsking === 'sold')
      .map((comp) => comp.price)
      .filter((price) => Number.isFinite(price))
    const allPrices = marketComps
      .map((comp) => comp.price)
      .filter((price) => Number.isFinite(price))
    const valuationPrices = soldPrices.length > 0 ? soldPrices : allPrices
    const estimatedMarketValue = median(valuationPrices)
    const lowCompValue = valuationPrices.length > 0 ? Math.min(...valuationPrices) : null
    const highCompValue = valuationPrices.length > 0 ? Math.max(...valuationPrices) : null
    const compCount = marketComps.length
    const soldCompCount = marketComps.filter((c) => c.soldOrAsking === 'sold').length
    let confidence: Confidence = 'LOW'
    if (soldCompCount >= 5) confidence = 'HIGH'
    else if (soldCompCount >= 2) confidence = 'MEDIUM'
    const totalInvested = vehicle.entries.reduce((sum, entry) => sum + (entry.cost || 0), 0)
    const proofCount = vehicle.entries.reduce((sum, entry) => sum + (entry.attachments?.length || 0), 0)
    const logCount = vehicle.entries.length
    const aiValuationRange = vehicle.aiEvaluation?.valuationRange

    return {
      vehicle,
      estimatedMarketValue,
      lowCompValue,
      highCompValue,
      compCount,
      soldCompCount,
      confidence,
      totalInvested,
      proofCount,
      logCount,
      aiValuationRange,
      aiGeneratedAt: vehicle.aiEvaluation?.generatedAt,
    }
  })

  const totalEstimatedValue = valuationVehicles.reduce((sum, item) => sum + (item.estimatedMarketValue || 0), 0)
  const totalInvested = valuationVehicles.reduce((sum, item) => sum + item.totalInvested, 0)
  const totalMarketComps = valuationVehicles.reduce((sum, item) => sum + item.compCount, 0)
  const totalSoldComps = valuationVehicles.reduce((sum, item) => sum + item.soldCompCount, 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 24px' }}>
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
            — VALUATION
          </div>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(36px,6vw,60px)', color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.02em' }}>
            VALUATION LAB
          </h1>
          <p style={{ color: 'var(--gray)', fontSize: 14, marginTop: 6 }}>
            Market comps, confidence, and proof strength across your garage.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <Link href="/app/vehicles/new" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
            + ADD VEHICLE
          </Link>
        </div>

        <div className="fade-up delay-1" style={{ background: 'linear-gradient(180deg, rgba(0,232,122,0.08) 0%, rgba(0,232,122,0.02) 100%)', border: '1px solid rgba(0,232,122,0.18)', borderRadius: 8, padding: '18px 20px', marginBottom: 24 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.12em', marginBottom: 6 }}>
            VALUATION METHOD
          </div>
          <div style={{ fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.6 }}>
            Valuations prioritize SOLD comps. Asking listings are shown for context but do not drive valuation when sold comps exist.
          </div>
        </div>

        {!loading && vehicles.length > 0 && (
          <div className="fade-up delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'TOTAL ESTIMATED VALUE', value: formatCurrency(totalEstimatedValue) },
              { label: 'TOTAL INVESTED', value: formatCurrency(totalInvested) },
              { label: 'TOTAL MARKET COMPS', value: totalMarketComps },
              { label: 'TOTAL SOLD COMPS', value: totalSoldComps },
            ].map((stat) => (
              <div key={stat.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '16px 20px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.12em', marginBottom: 8 }}>
                  {stat.label}
                </div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: 'var(--off-white)', lineHeight: 1 }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
            LOADING VALUATION LAB...
          </div>
        ) : vehicles.length === 0 ? (
          <div className="fade-in" style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: 'var(--gray)', marginBottom: 16 }}>
              NO VEHICLES TO VALUE
            </div>
            <p style={{ color: 'var(--gray)', marginBottom: 24, fontSize: 15 }}>
              Add a vehicle in your garage to start building a valuation view.
            </p>
            <Link href="/app" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 500, padding: '12px 24px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>
              GO TO GARAGE
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {valuationVehicles.map((item, index) => {
              const { vehicle } = item
              const coverPhotoKey = vehicle.coverPhotoKey || vehicle.photoKeys?.[0]

              return (
                <div key={vehicle.id} className={`fade-up delay-${Math.min(index + 1, 6)}`} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 180 }}>
                    <div style={{ background: '#151513', overflow: 'hidden' }}>
                      {coverPhotoKey ? (
                        <img src={photoUrl(coverPhotoKey)} alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} className="card-photo" loading="lazy" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.1em' }}>
                          NO PHOTO
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '18px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                        <div>
                          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--off-white)', letterSpacing: '0.03em', lineHeight: 1, marginBottom: 4 }}>
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </div>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)', letterSpacing: '0.06em' }}>
                            {[vehicle.trim, vehicle.color, vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : null].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>

                        <div style={{ minWidth: 220 }}>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 6 }}>
                            ESTIMATED VALUE
                          </div>
                          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 34, color: 'var(--off-white)', lineHeight: 1, marginBottom: 4 }}>
                            {item.estimatedMarketValue == null ? 'NO DATA' : formatCurrency(item.estimatedMarketValue)}
                          </div>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray-light)', letterSpacing: '0.06em' }}>
                            RANGE: {item.lowCompValue == null || item.highCompValue == null ? '—' : `${formatCurrency(item.lowCompValue)} - ${formatCurrency(item.highCompValue)}`}
                          </div>
                          {item.aiValuationRange && (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                                <div>
                                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 3 }}>AI TARGET</div>
                                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--off-white)' }}>{formatCurrency(item.aiValuationRange.target)}</div>
                                </div>
                                <div>
                                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 3 }}>AI RANGE</div>
                                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray-light)' }}>{formatCurrency(item.aiValuationRange.low)} - {formatCurrency(item.aiValuationRange.high)}</div>
                                </div>
                              </div>
                              {item.aiGeneratedAt && (
                                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.06em', marginTop: 6 }}>
                                  AI GENERATED {new Date(item.aiGeneratedAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12, marginBottom: 16 }}>
                        {[
                          { l: 'CONFIDENCE', v: item.confidence, tone: confidenceTone(item.confidence) },
                          { l: 'COMPS', v: item.compCount, tone: 'var(--off-white)' },
                          { l: 'SOLD COMPS', v: item.soldCompCount, tone: 'var(--off-white)' },
                          { l: 'PROOF FILES', v: item.proofCount, tone: 'var(--off-white)' },
                          { l: 'LOG RECORDS', v: item.logCount, tone: 'var(--off-white)' },
                          { l: 'INVESTED', v: formatCurrency(item.totalInvested), tone: 'var(--off-white)' },
                        ].map((stat) => (
                          <div key={stat.l}>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 4 }}>
                              {stat.l}
                            </div>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: stat.tone }}>
                              {stat.v}
                            </div>
                          </div>
                        ))}
                      </div>

                      <Link href={`/app/vehicles/${vehicle.id}`} style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 500, padding: '8px 12px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em', display: 'inline-block' }}>
                        OPEN BUILD
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
