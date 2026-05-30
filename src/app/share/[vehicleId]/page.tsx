import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { attachmentUrl, photoUrl } from '@/lib/api'
import type { Vehicle } from '@/lib/types'

export const revalidate = 60

const PROOF_PACKET_DESCRIPTION = 'Buyer-ready proof packet from Appreciate Me.'

type ShareParams = { params: { vehicleId: string } }

function formatCurrency(value: number) {
  return `$${Math.round(Math.abs(value)).toLocaleString()}`
}

function formatDate(value?: string) {
  if (!value) return 'Not listed'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not listed'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function originFromHeaders() {
  const h = headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'appreciateme.netlify.app'
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

function absoluteUrl(path: string, origin: string) {
  if (path.startsWith('http')) return path
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

async function getPublicVehicleServer(vehicleId: string) {
  const origin = originFromHeaders()
  const res = await fetch(`${origin}/.netlify/functions/get-vehicle-public?id=${encodeURIComponent(vehicleId)}`, {
    next: { revalidate: 60 },
  })
  if (!res.ok) return null
  return res.json() as Promise<Vehicle>
}

function vehicleMarket(vehicle: Vehicle) {
  const marketComps = vehicle.marketComps || []
  const soldPrices = marketComps
    .filter(comp => comp.soldOrAsking === 'sold')
    .map(comp => comp.price)
    .filter(price => Number.isFinite(price))
  const allPrices = marketComps.map(comp => comp.price).filter(price => Number.isFinite(price))
  const prices = soldPrices.length > 0 ? soldPrices : allPrices
  return {
    estimatedMarketValue: median(prices),
    soldCompCount: soldPrices.length,
    compCount: prices.length,
  }
}

function proofFileCount(vehicle: Vehicle) {
  const legacyAttachments = (vehicle.entries || []).reduce((sum, entry) => sum + (entry.attachments?.length || 0), 0)
  return legacyAttachments + (vehicle.proofAttachments?.length || 0)
}

function totalDocumentedSpend(vehicle: Vehicle) {
  return (vehicle.entries || []).reduce((sum, entry) => sum + (entry.cost || 0), 0)
}

function latestRecordDate(vehicle: Vehicle) {
  const dates = [
    vehicle.createdAt,
    ...(vehicle.entries || []).map(entry => entry.date),
    ...(vehicle.proofAttachments || []).map(proof => proof.uploadedAt),
  ]
    .map(value => new Date(value).getTime())
    .filter(value => Number.isFinite(value))
  if (dates.length === 0) return null
  return new Date(Math.max(...dates)).toISOString()
}

function entryTypeLabel(type: string) {
  if (type === 'maintenance') return 'Maintenance record'
  if (type === 'repair') return 'Repair history'
  if (type === 'mod') return 'Build / modification'
  return 'Ownership record'
}

function proofTypeLabel(type?: string) {
  if (!type) return 'Seller-provided proof'
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function entryProofCount(vehicle: Vehicle, entryId: string) {
  return (vehicle.proofAttachments || []).filter(proof => proof.linkedType === 'logEntry' && proof.linkedId === entryId).length
}

function majorWork(vehicle: Vehicle) {
  return (vehicle.entries || [])
    .filter(entry => entry.type === 'maintenance' || entry.type === 'repair')
    .sort((a, b) => (b.cost || 0) - (a.cost || 0))
    .slice(0, 3)
}

function buyerQuestions(vehicle: Vehicle) {
  const questions = [
    'Can you show the original receipts or photos for the most important work?',
    'Who performed the major repairs or maintenance, and is any work under warranty?',
    'Has anything changed since the last documented record in this packet?',
    'Are there any known issues, leaks, warning lights, or upcoming maintenance items?',
  ]
  if (proofFileCount(vehicle) === 0) {
    questions.unshift('Can you provide receipts, invoices, or repair photos before I rely on this record?')
  }
  if ((vehicle.marketComps || []).length > 0) {
    questions.push('Which comparable sales best match this vehicle by condition, mileage, and options?')
  }
  return questions.slice(0, 5)
}

function vehicleTitle(vehicle: Vehicle) {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`
}

function coverImageUrl(vehicle: Vehicle, origin: string) {
  const coverKey = vehicle.coverPhotoKey || vehicle.photoKeys?.[0]
  return coverKey ? absoluteUrl(photoUrl(coverKey), origin) : undefined
}

export async function generateMetadata({ params }: ShareParams): Promise<Metadata> {
  const vehicle = await getPublicVehicleServer(params.vehicleId)
  if (!vehicle) {
    return {
      title: 'Proof Packet | Appreciate Me',
      description: PROOF_PACKET_DESCRIPTION,
    }
  }

  const origin = originFromHeaders()
  const title = `${vehicleTitle(vehicle)} Proof Packet`
  const market = vehicleMarket(vehicle)
  const proofCount = proofFileCount(vehicle)
  const marketText = market.estimatedMarketValue == null ? 'Estimated market value unavailable' : `Estimated market value ${formatCurrency(market.estimatedMarketValue)}`
  const description = `${marketText}. ${proofCount} proof files. ${PROOF_PACKET_DESCRIPTION}`
  const image = coverImageUrl(vehicle, origin)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default async function SharePage({ params }: ShareParams) {
  const vehicle = await getPublicVehicleServer(params.vehicleId)

  if (!vehicle) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 48, color: 'var(--gray)', letterSpacing: '0.05em' }}>NOT FOUND</h1>
          <p style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>This Proof Packet does not exist or has been removed.</p>
        </div>
      </main>
    )
  }

  const market = vehicleMarket(vehicle)
  const title = vehicleTitle(vehicle)
  const proofCount = proofFileCount(vehicle)
  const cover = vehicle.coverPhotoKey || vehicle.photoKeys?.[0]
  const coverUrl = cover ? photoUrl(cover) : null
  const entries = [...(vehicle.entries || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const publicProof = vehicle.proofAttachments || []
  const documentedSpend = totalDocumentedSpend(vehicle)
  const latestDate = latestRecordDate(vehicle)
  const majorRecords = majorWork(vehicle)
  const questions = buyerQuestions(vehicle)

  return (
    <main style={{ minHeight: '100vh', background: 'var(--black)', color: 'var(--off-white)' }}>
      <section style={{ maxWidth: 920, margin: '0 auto', padding: '34px 24px 46px' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.16em', marginBottom: 12 }}>BUYER-READY PROOF PACKET</div>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(42px,8vw,78px)', letterSpacing: '0.035em', lineHeight: 0.95, marginBottom: 10 }}>
          {title}
        </h1>
        <p style={{ color: 'var(--gray-light)', fontSize: 15, lineHeight: 1.55, maxWidth: 680, marginBottom: 22 }}>
          Seller-provided maintenance record and repair history for this vehicle. Review the documented work, public-safe proof, and buyer questions before relying on the record.
        </p>

        {coverUrl && (
          <img src={coverUrl} alt={title} style={{ width: '100%', maxHeight: 520, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', background: '#0e0e0d', marginBottom: 18 }} />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Estimated market value', value: market.estimatedMarketValue == null ? 'No data' : formatCurrency(market.estimatedMarketValue) },
            { label: 'Log entries', value: String(entries.length) },
            { label: 'Documented spend', value: documentedSpend > 0 ? formatCurrency(documentedSpend) : 'Not listed' },
            { label: 'Proof items', value: String(proofCount) },
            { label: 'Vehicle photos', value: String(vehicle.photoKeys?.length || 0) },
            { label: 'Last updated', value: formatDate(latestDate || vehicle.createdAt) },
            { label: 'mileage', value: vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : 'Not listed' },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '15px 16px' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.12em', marginBottom: 7, textTransform: 'uppercase' }}>{stat.label}</div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, color: 'var(--off-white)', lineHeight: 1 }}>{stat.value}</div>
            </div>
          ))}
        </div>

        <section style={{ background: 'linear-gradient(180deg, rgba(0,232,122,0.08), rgba(0,232,122,0.02))', border: '1px solid rgba(0,232,122,0.24)', borderRadius: 8, padding: '18px 20px', marginBottom: 22 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.14em', marginBottom: 8 }}>BUYER TRUST SUMMARY</div>
          <p style={{ color: 'var(--gray-light)', lineHeight: 1.6, margin: 0 }}>
            This Proof Packet organizes the seller&apos;s maintenance story into a buyer-readable record. It does not independently verify receipts or repair quality; it shows seller-provided proof and history so you can ask sharper questions before buying.
          </p>
          {majorRecords.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.12em' }}>MAJOR WORK COMPLETED</div>
              {majorRecords.map(entry => (
                <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8, color: 'var(--gray-light)', fontSize: 13 }}>
                  <span>{entry.title}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--off-white)', whiteSpace: 'nowrap' }}>{entry.cost > 0 ? formatCurrency(entry.cost) : formatDate(entry.date)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.14em', marginBottom: 12 }}>SELLER-PROVIDED PROOF</div>
          {publicProof.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {publicProof.map(proof => {
                const url = `/.netlify/functions/upload-proof?key=${encodeURIComponent(proof.fileKey)}`
                const isImage = proof.mimeType?.startsWith('image/') || proof.fileType?.startsWith('image/')
                return (
                  <a key={proof.id} href={url} target="_blank" rel="noopener noreferrer" style={{ width: 190, background: '#0e0e0d', border: '1px solid rgba(0,232,122,0.16)', borderRadius: 6, padding: 8, color: 'var(--off-white)', textDecoration: 'none' }}>
                    <div style={{ height: 96, borderRadius: 4, overflow: 'hidden', background: '#050505', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                      {isImage ? <img src={url} alt={proof.label || proof.fileName} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--accent)' }}>{proof.mimeType === 'application/pdf' ? 'PDF' : 'FILE'}</span>}
                    </div>
                    <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proof.label || proof.fileName}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', marginTop: 4 }}>{proofTypeLabel(proof.proofType)}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', marginTop: 4 }}>{formatDate(proof.uploadedAt)}</div>
                  </a>
                )
              })}
            </div>
          ) : (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px', color: 'var(--gray-light)', lineHeight: 1.55 }}>
              No proof files added yet. Ask the seller for receipts or photos before relying on this record.
            </div>
          )}
        </section>

        {entries.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.14em', marginBottom: 12 }}>DOCUMENTED REPAIR HISTORY</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {entries.slice(0, 12).map(entry => (
                <div key={entry.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.12em', marginBottom: 5 }}>{entryTypeLabel(entry.type).toUpperCase()}</div>
                      <strong style={{ color: 'var(--off-white)' }}>{entry.title}</strong>
                    </div>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)' }}>{formatDate(entry.date)}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', marginBottom: entry.description ? 8 : 0 }}>
                    <span>Documented spend: {entry.cost > 0 ? formatCurrency(entry.cost) : 'Not listed'}</span>
                    <span>Seller-provided proof: {entryProofCount(vehicle, entry.id)} item{entryProofCount(vehicle, entry.id) === 1 ? '' : 's'}</span>
                  </div>
                  {entry.description && <p style={{ color: 'var(--gray-light)', margin: 0, lineHeight: 1.5 }}>{entry.description}</p>}
                  {(entry.attachments || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {(entry.attachments || []).map(attachment => (
                        <a key={attachment.key} href={attachmentUrl(attachment.key)} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}>
                          {attachment.type === 'application/pdf' ? 'PDF' : 'PROOF'} · {attachment.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section style={{ background: '#0e0e0d', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.14em', marginBottom: 12 }}>QUESTIONS TO ASK THE SELLER</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--gray-light)', lineHeight: 1.75 }}>
            {questions.map(question => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </section>

      </section>
    </main>
  )
}
