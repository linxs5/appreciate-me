'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  getVehicle, updateVehicle, deleteVehicle,
  addEntry, updateEntry, deleteEntry,
  uploadPhoto, setCoverPhoto, photoUrl,
  uploadEntryAttachment, attachmentUrl,
} from '@/lib/api'
import type { Vehicle, LogEntry, MarketComp } from '@/lib/types'

const MAKES = ['Toyota','Honda','Ford','Chevrolet','BMW','Mercedes-Benz','Audi','Nissan','Mazda','Subaru','Dodge','Jeep','Ram','GMC','Cadillac','Lexus','Acura','Infiniti','Mitsubishi','Volkswagen','Porsche','Ferrari','Lamborghini','Other']
const YEARS = Array.from({length: 2026-1980+1}, (_,i) => 2026-i)

const emptyEntryData = {
  type: 'maintenance' as LogEntry['type'],
  title: '',
  cost: '',
  estimatedValueImpact: '',
  date: '',
  description: '',
}

const emptyCompData = {
  source: '',
  url: '',
  price: '',
  mileage: '',
  soldOrAsking: 'asking' as MarketComp['soldOrAsking'],
  notes: '',
}

function formatCurrency(value: number) {
  return `$${Math.abs(value).toLocaleString()}`
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

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

export default function VehiclePage({ params }: { params: { id: string } }) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Vehicle>>({})
  const [showDelete, setShowDelete] = useState(false)
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null)
  const [entryData, setEntryData] = useState(emptyEntryData)
  const [showCompForm, setShowCompForm] = useState(false)
  const [compData, setCompData] = useState(emptyCompData)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // Photo state
  const [photoLoading, setPhotoLoading] = useState(false)
  const [coverSaving, setCoverSaving] = useState<string | null>(null)
  const [activePhoto, setActivePhoto] = useState<string | null>(null)
  const [uploadingEntryId, setUploadingEntryId] = useState<string | null>(null)

  const photoRef = useRef<HTMLInputElement>(null)
  const attachmentInputsRef = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { load() }, [params.id])

  async function load() {
    try {
      const v = await getVehicle(params.id)
      if (!v) { window.location.href = '/app'; return }
      setVehicle(v)
      setEditData({ year: v.year, make: v.make, model: v.model, trim: v.trim, color: v.color, mileage: v.mileage, vin: v.vin })
    } catch { window.location.href = '/app' }
    finally { setLoading(false) }
  }

  async function handleSaveVehicle() {
    if (!vehicle) return
    setSaving(true)
    try {
      const updated = await updateVehicle(vehicle.id, editData)
      setVehicle(updated)
      setEditing(false)
    } catch { alert('Failed to save. Try again.') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    try { await deleteVehicle(params.id) } catch {}
    window.location.href = '/app'
  }

  async function refreshVehicle(vehicleId: string) {
    const freshVehicle = await getVehicle(vehicleId)
    setVehicle(freshVehicle)
    return freshVehicle
  }

  // APPEND a new vehicle photo. Server (upload-photo.mts) appends to photoKeys.
  // We DO NOT call updateVehicle with new photoKeys. We just refetch.
  async function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    if (!vehicle || !input.files?.length) return
    const files = Array.from(input.files)
    setPhotoLoading(true)
    try {
      for (const file of files) {
        await uploadPhoto(vehicle.id, file)
      }
      const freshVehicle = await refreshVehicle(vehicle.id)
      if (freshVehicle?.photoKeys?.length) {
        setActivePhoto(freshVehicle.photoKeys[freshVehicle.photoKeys.length - 1] || null)
      }
    } catch {
      alert('Photo upload failed. Try again.')
    } finally {
      input.value = ''
      setPhotoLoading(false)
    }
  }

  async function handleSetCover(key: string) {
    if (!vehicle || coverSaving) return
    setCoverSaving(key)
    try {
      const updated = await setCoverPhoto(vehicle.id, key)
      setVehicle(updated)
      setActivePhoto(null)
    } catch {
      alert('Failed to set cover photo. Try again.')
    } finally {
      setCoverSaving(null)
    }
  }

  async function handleSaveEntry() {
    if (!vehicle) return
    setSaving(true)
    try {
      const estimatedValueImpact = entryData.estimatedValueImpact === ''
        ? undefined
        : parseFloat(entryData.estimatedValueImpact) || 0
      let updated: Vehicle
      if (editingEntry) {
        updated = await updateEntry(vehicle.id, editingEntry.id, {
          type: entryData.type,
          title: entryData.title,
          cost: parseFloat(entryData.cost) || 0,
          estimatedValueImpact,
          date: entryData.date,
          description: entryData.description,
        })
      } else {
        updated = await addEntry(vehicle.id, {
          type: entryData.type,
          title: entryData.title,
          cost: parseFloat(entryData.cost) || 0,
          estimatedValueImpact,
          date: entryData.date,
          description: entryData.description,
        })
      }
      setVehicle(updated)
      setShowEntryForm(false)
      setEditingEntry(null)
      setEntryData(emptyEntryData)
    } catch { alert('Failed to save entry.') }
    finally { setSaving(false) }
  }

  async function handleDeleteEntry(entryId: string) {
    if (!vehicle || !confirm('Remove this entry?')) return
    try {
      const updated = await deleteEntry(vehicle.id, entryId)
      setVehicle(updated)
    } catch { alert('Failed to delete entry.') }
  }

  async function handleAttachmentUpload(entryId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    if (!vehicle || !input.files?.length) return
    const files = Array.from(input.files)
    setUploadingEntryId(entryId)
    try {
      for (const file of files) {
        await uploadEntryAttachment(vehicle.id, entryId, file)
      }
      await refreshVehicle(vehicle.id)
    } catch {
      alert('Attachment upload failed. Try again.')
    } finally {
      input.value = ''
      setUploadingEntryId(null)
    }
  }

  async function handleSaveComp() {
    if (!vehicle) return
    setSaving(true)
    try {
      const nextComp: MarketComp = {
        id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}`,
        source: compData.source.trim(),
        url: compData.url.trim() || undefined,
        price: parseFloat(compData.price) || 0,
        mileage: compData.mileage === '' ? undefined : parseFloat(compData.mileage) || 0,
        soldOrAsking: compData.soldOrAsking,
        notes: compData.notes.trim() || undefined,
        dateAdded: new Date().toISOString(),
      }
      const updated = await updateVehicle(vehicle.id, {
        marketComps: [...(vehicle.marketComps || []), nextComp],
      })
      setVehicle(updated)
      setCompData(emptyCompData)
      setShowCompForm(false)
    } catch {
      alert('Failed to save market comp.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteComp(compId: string) {
    if (!vehicle || !confirm('Remove this market comp?')) return
    setSaving(true)
    try {
      const updated = await updateVehicle(vehicle.id, {
        marketComps: (vehicle.marketComps || []).filter(comp => comp.id !== compId),
      })
      setVehicle(updated)
    } catch {
      alert('Failed to delete market comp.')
    } finally {
      setSaving(false)
    }
  }

  function openEditEntry(entry: LogEntry) {
    setEditingEntry(entry)
    setEntryData({
      type: entry.type,
      title: entry.title,
      cost: String(entry.cost),
      estimatedValueImpact: entry.estimatedValueImpact == null ? '' : String(entry.estimatedValueImpact),
      date: entry.date,
      description: entry.description || '',
    })
    setShowEntryForm(true)
  }

  function copyShareLink() {
    const url = `${window.location.origin}/share/${params.id}`
    navigator.clipboard.writeText(url).catch(() => {
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const badgeClass: Record<string, string> = { mod: 'badge-mod', maintenance: 'badge-maintenance', repair: 'badge-repair' }

  const inputStyle: React.CSSProperties = {
    background: '#1a1a18', border: '1px solid var(--border)', borderRadius: 4,
    color: 'var(--off-white)', padding: '10px 12px', width: '100%',
    fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)',
    letterSpacing: '0.1em', display: 'block', marginBottom: 6,
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.1em' }}>LOADING...</div>
    </div>
  )
  if (!vehicle) return null

  // Hero source — explicit precedence per spec
  const coverPhotoKey = vehicle.coverPhotoKey || vehicle.photoKeys?.[0] || null
  const heroKey = activePhoto || vehicle.coverPhotoKey || vehicle.photoKeys?.[0] || null
  const galleryKeys = vehicle.photoKeys || []
  const marketComps = vehicle.marketComps || []
  const compPrices = marketComps.map(comp => comp.price).filter(price => Number.isFinite(price))
  const compCount = compPrices.length
  const lowCompValue = compCount ? Math.min(...compPrices) : null
  const highCompValue = compCount ? Math.max(...compPrices) : null
  const averageCompValue = compCount ? compPrices.reduce((sum, price) => sum + price, 0) / compCount : null
  const medianCompValue = median(compPrices)
  const totalInvested = vehicle.entries.reduce((sum, entry) => sum + (entry.cost || 0), 0)
  const totalImpact = vehicle.entries.reduce((sum, entry) => sum + (entry.estimatedValueImpact || 0), 0)
  const netPosition = totalImpact - totalInvested

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(10,10,9,0.92)', backdropFilter: 'blur(12px)', zIndex: 50 }}>
        <Link href="/app" style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--off-white)', textDecoration: 'none' }}>
          Appreciate<span style={{ color: 'var(--accent)' }}>.</span>Me
        </Link>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={copyShareLink} style={{ background: copied ? 'var(--accent)' : 'transparent', border: '1px solid var(--border)', color: copied ? 'var(--black)' : 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '7px 14px', borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.05em' }}>
            {copied ? 'COPIED!' : 'SHARE'}
          </button>
          <Link href="/app/vehicles/new" style={{ background: 'var(--accent)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 500, padding: '7px 14px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em' }}>+ ADD</Link>
        </div>
      </nav>

      {/* Hero photo */}
      <div style={{ position: 'relative', background: '#0e0e0d' }} className="scale-in">
        {heroKey ? (
          <img src={photoUrl(heroKey)} alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} className="hero-photo" />
        ) : (
          <div style={{ aspectRatio: '16/9', maxHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111110' }}>
            <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.1em' }}>NO PHOTO</div>
          </div>
        )}
        <button onClick={() => photoRef.current?.click()} disabled={photoLoading}
          style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(10,10,9,0.75)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', color: 'var(--off-white)', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '6px 12px', borderRadius: 4, cursor: photoLoading ? 'wait' : 'pointer', letterSpacing: '0.08em' }}>
          {photoLoading ? 'UPLOADING...' : '+ ADD PHOTO'}
        </button>
        <input ref={photoRef} type="file" accept="image/*" multiple onChange={handlePhotoAdd} style={{ display: 'none' }} />
      </div>

      {/* Photo gallery — owner controls */}
      {galleryKeys.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border)', background: '#0c0c0b' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '14px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.12em' }}>
                — {galleryKeys.length} PHOTO{galleryKeys.length === 1 ? '' : 'S'}
              </div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.08em' }}>
                CLICK TO PREVIEW · MAKE COVER SETS PUBLIC IMAGE
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {galleryKeys.map(key => {
                const isCover = key === coverPhotoKey
                const isPreview = key === heroKey
                const isSavingThis = coverSaving === key
                return (
                  <div key={key} style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      onClick={() => setActivePhoto(key)}
                      style={{
                        width: 110, height: 78, padding: 0, borderRadius: 4, overflow: 'hidden',
                        cursor: 'pointer', background: '#0e0e0d',
                        border: isPreview ? '2px solid var(--accent)' : '1px solid var(--border)',
                        display: 'block',
                      }}
                      aria-label="Preview photo"
                    >
                      <img src={photoUrl(key)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                    {isCover ? (
                      <div style={{
                        position: 'absolute', top: 4, left: 4,
                        background: 'rgba(0,232,122,0.95)', color: 'var(--black)',
                        fontFamily: 'DM Mono, monospace', fontSize: 8, fontWeight: 500,
                        letterSpacing: '0.1em', padding: '2px 6px', borderRadius: 2,
                      }}>
                        ✓ COVER
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSetCover(key)}
                        disabled={!!coverSaving}
                        style={{
                          position: 'absolute', bottom: 4, left: 4, right: 4,
                          background: 'rgba(10,10,9,0.85)', backdropFilter: 'blur(4px)',
                          border: '1px solid rgba(0,232,122,0.4)', color: 'var(--accent)',
                          fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.08em',
                          padding: '3px 4px', borderRadius: 2, cursor: coverSaving ? 'wait' : 'pointer',
                        }}
                      >
                        {isSavingThis ? '...' : 'MAKE COVER'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {/* Vehicle header */}
        <div className="fade-up" style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— VEHICLE PROFILE</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            {editing ? (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 14 }}>
                  <div><label style={labelStyle}>YEAR</label>
                    <select value={editData.year} onChange={e => setEditData(p => ({...p, year: +e.target.value}))} style={inputStyle}>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select></div>
                  <div><label style={labelStyle}>MAKE</label>
                    <select value={editData.make} onChange={e => setEditData(p => ({...p, make: e.target.value}))} style={inputStyle}>
                      {MAKES.map(m => <option key={m}>{m}</option>)}
                    </select></div>
                  <div><label style={labelStyle}>MODEL</label>
                    <input value={editData.model || ''} onChange={e => setEditData(p => ({...p, model: e.target.value}))} style={inputStyle} placeholder="e.g. Ranger" /></div>
                  <div><label style={labelStyle}>TRIM</label>
                    <input value={editData.trim || ''} onChange={e => setEditData(p => ({...p, trim: e.target.value}))} style={inputStyle} placeholder="e.g. XLT" /></div>
                  <div><label style={labelStyle}>COLOR</label>
                    <input value={editData.color || ''} onChange={e => setEditData(p => ({...p, color: e.target.value}))} style={inputStyle} placeholder="e.g. Black" /></div>
                  <div><label style={labelStyle}>MILEAGE</label>
                    <input type="number" value={editData.mileage || ''} onChange={e => setEditData(p => ({...p, mileage: +e.target.value}))} style={inputStyle} min={0} max={999999} /></div>
                  <div><label style={labelStyle}>VIN (OPTIONAL)</label>
                    <input value={editData.vin || ''} onChange={e => setEditData(p => ({...p, vin: e.target.value}))} style={inputStyle} placeholder="17 chars" maxLength={17} /></div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleSaveVehicle} disabled={saving} style={{ background: 'var(--accent)', color: 'var(--black)', border: 'none', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 500, padding: '9px 20px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>
                    {saving ? 'SAVING...' : 'SAVE CHANGES'}
                  </button>
                  <button onClick={() => setEditing(false)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 18px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>CANCEL</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(28px,5vw,48px)', color: 'var(--off-white)', letterSpacing: '0.03em', lineHeight: 1, marginBottom: 6 }}>
                    {vehicle.year} {vehicle.make.toUpperCase()} {vehicle.model.toUpperCase()}
                  </h1>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--gray)' }}>
                    {[vehicle.trim, vehicle.color, vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : null].filter(Boolean).join(' · ')}
                  </div>
                  {vehicle.vin && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>VIN: {vehicle.vin}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '8px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>EDIT</button>
                  <button onClick={() => setShowDelete(true)} style={{ background: 'transparent', border: '1px solid rgba(255,80,80,0.3)', color: '#ff6b6b', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '8px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>DELETE</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Delete confirmation */}
        {showDelete && (
          <div className="fade-in" style={{ background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 6, padding: '16px 20px', marginBottom: 24 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: '#ff8080', marginBottom: 12 }}>DELETE THIS VEHICLE? This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleDelete} style={{ background: '#c0392b', border: 'none', color: '#fff', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 18px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>YES, DELETE</button>
              <button onClick={() => setShowDelete(false)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 16px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>CANCEL</button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="fade-up delay-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 36 }}>
          {[
            { l: 'TOTAL INVESTED', v: formatCurrency(totalInvested), tone: 'var(--off-white)' },
            { l: 'TOTAL VALUE IMPACT', v: formatSignedCurrency(totalImpact), tone: financialTone(totalImpact) },
            { l: 'NET POSITION', v: formatSignedCurrency(netPosition), tone: financialTone(netPosition) },
            medianCompValue == null
              ? { l: 'ESTIMATED MARKET VALUE', v: 'NO DATA', tone: 'var(--gray)', sub: 'No comps added yet' }
              : { l: 'ESTIMATED MARKET VALUE', v: formatCurrency(medianCompValue), tone: 'var(--off-white)', sub: `Estimated Market Value based on ${compCount} comp${compCount === 1 ? '' : 's'}` },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 18px' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 6 }}>{s.l}</div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, color: s.tone, lineHeight: 1 }}>{s.v}</div>
              {s.sub && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', marginTop: 3 }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Market comps */}
        <div className="fade-up delay-3" style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em' }}>— MARKET COMPS</div>
            <button
              onClick={() => setShowCompForm(v => !v)}
              style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '6px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              {showCompForm ? 'CANCEL' : '+ ADD COMP'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { l: 'COMP COUNT', v: String(compCount) },
              { l: 'LOW', v: lowCompValue == null ? '—' : formatCurrency(lowCompValue) },
              { l: 'MEDIAN', v: medianCompValue == null ? '—' : formatCurrency(medianCompValue) },
              { l: 'AVERAGE', v: averageCompValue == null ? '—' : formatCurrency(Math.round(averageCompValue)) },
              { l: 'HIGH', v: highCompValue == null ? '—' : formatCurrency(highCompValue) },
            ].map((stat) => (
              <div key={stat.l} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 6 }}>{stat.l}</div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: 'var(--off-white)', lineHeight: 1 }}>{stat.v}</div>
              </div>
            ))}
          </div>

          {showCompForm && (
            <div className="scale-in" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 16 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: 'var(--off-white)', marginBottom: 16, letterSpacing: '0.03em' }}>
                NEW MARKET COMP
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 12 }}>
                <div><label style={labelStyle}>SOURCE</label>
                  <input value={compData.source} onChange={e => setCompData(p => ({ ...p, source: e.target.value }))} style={inputStyle} placeholder="Cars & Bids, BaT, FB Marketplace..." /></div>
                <div><label style={labelStyle}>URL (OPTIONAL)</label>
                  <input value={compData.url} onChange={e => setCompData(p => ({ ...p, url: e.target.value }))} style={inputStyle} placeholder="https://..." /></div>
                <div><label style={labelStyle}>PRICE ($)</label>
                  <input type="number" value={compData.price} onChange={e => setCompData(p => ({ ...p, price: e.target.value }))} style={inputStyle} placeholder="0" min={0} /></div>
                <div><label style={labelStyle}>MILEAGE (OPTIONAL)</label>
                  <input type="number" value={compData.mileage} onChange={e => setCompData(p => ({ ...p, mileage: e.target.value }))} style={inputStyle} placeholder="0" min={0} /></div>
                <div><label style={labelStyle}>SOLD OR ASKING</label>
                  <select value={compData.soldOrAsking} onChange={e => setCompData(p => ({ ...p, soldOrAsking: e.target.value as MarketComp['soldOrAsking'] }))} style={inputStyle}>
                    <option value="asking">Asking</option>
                    <option value="sold">Sold</option>
                  </select></div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>NOTES (OPTIONAL)</label>
                <textarea value={compData.notes} onChange={e => setCompData(p => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} placeholder="Condition, mods, trim differences, seller notes..." />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleSaveComp} disabled={saving || !compData.source || !compData.price} style={{ background: 'var(--accent)', color: 'var(--black)', border: 'none', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 500, padding: '9px 20px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em', opacity: !compData.source || !compData.price ? 0.5 : 1 }}>
                  {saving ? 'SAVING...' : 'SAVE COMP'}
                </button>
                <button onClick={() => { setShowCompForm(false); setCompData(emptyCompData) }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 16px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>CANCEL</button>
              </div>
            </div>
          )}

          {marketComps.length === 0 ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.08em' }}>
              NO COMPS ADDED YET
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {marketComps
                .slice()
                .sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime())
                .map((comp) => (
                  <div key={comp.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--off-white)' }}>{comp.source}</span>
                          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.1em', padding: '3px 7px', borderRadius: 3, whiteSpace: 'nowrap', background: comp.soldOrAsking === 'sold' ? 'rgba(0,232,122,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${comp.soldOrAsking === 'sold' ? 'rgba(0,232,122,0.35)' : 'rgba(255,255,255,0.08)'}`, color: comp.soldOrAsking === 'sold' ? 'var(--accent)' : 'var(--gray-light)' }}>
                            {comp.soldOrAsking.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 6, fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                          <span style={{ color: 'var(--off-white)' }}>Price: {formatCurrency(comp.price)}</span>
                          <span style={{ color: 'var(--gray)' }}>Mileage: {comp.mileage == null ? '—' : `${comp.mileage.toLocaleString()} mi`}</span>
                          <span style={{ color: 'var(--gray)' }}>Added: {new Date(comp.dateAdded).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </div>
                        {comp.notes && <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.5, marginBottom: comp.url ? 6 : 0 }}>{comp.notes}</div>}
                        {comp.url && (
                          <a href={comp.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', letterSpacing: '0.04em' }}>
                            VIEW LISTING →
                          </a>
                        )}
                      </div>
                      <button onClick={() => handleDeleteComp(comp.id)} style={{ background: 'transparent', border: '1px solid rgba(255,80,80,0.2)', color: '#ff8080', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '4px 8px', borderRadius: 3, cursor: 'pointer' }}>
                        ×
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Build log */}
        <div className="fade-up delay-4">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em' }}>— BUILD LOG</div>
            <button onClick={() => { setShowEntryForm(true); setEditingEntry(null); setEntryData({ ...emptyEntryData, date: new Date().toISOString().split('T')[0] }) }}
              style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '6px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>
              + ADD ENTRY
            </button>
          </div>

          {/* Entry form */}
          {showEntryForm && (
            <div className="scale-in" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '20px', marginBottom: 16 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: 'var(--off-white)', marginBottom: 16, letterSpacing: '0.03em' }}>
                {editingEntry ? 'EDIT ENTRY' : 'NEW ENTRY'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 12 }}>
                <div><label style={labelStyle}>TYPE</label>
                  <select value={entryData.type} onChange={e => setEntryData(p => ({...p, type: e.target.value as LogEntry['type']}))} style={inputStyle}>
                    <option value="maintenance">Maintenance</option>
                    <option value="repair">Repair</option>
                    <option value="mod">Mod</option>
                  </select></div>
                <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>TITLE</label>
                  <input value={entryData.title} onChange={e => setEntryData(p => ({...p, title: e.target.value}))} style={inputStyle} placeholder="e.g. Oil Change — Mobil 1 5W-30" /></div>
                <div><label style={labelStyle}>COST ($)</label>
                  <input type="number" value={entryData.cost} onChange={e => setEntryData(p => ({...p, cost: e.target.value}))} style={inputStyle} placeholder="0.00" min={0} /></div>
                <div><label style={labelStyle}>ESTIMATED VALUE IMPACT ($)</label>
                  <input type="number" value={entryData.estimatedValueImpact} onChange={e => setEntryData(p => ({...p, estimatedValueImpact: e.target.value}))} style={inputStyle} placeholder="Optional" /></div>
                <div><label style={labelStyle}>DATE</label>
                  <input type="date" value={entryData.date} onChange={e => setEntryData(p => ({...p, date: e.target.value}))} style={inputStyle} /></div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>DESCRIPTION (OPTIONAL)</label>
                <textarea value={entryData.description} onChange={e => setEntryData(p => ({...p, description: e.target.value}))} style={{...inputStyle, resize: 'vertical', minHeight: 80}} placeholder="Parts used, shop name, notes..." />
              </div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', marginBottom: 14, letterSpacing: '0.06em' }}>
                TIP: SAVE ENTRY FIRST, THEN ATTACH RECEIPTS FROM THE ENTRY CARD.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleSaveEntry} disabled={saving || !entryData.title} style={{ background: 'var(--accent)', color: 'var(--black)', border: 'none', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 500, padding: '9px 20px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em', opacity: !entryData.title ? 0.5 : 1 }}>
                  {saving ? 'SAVING...' : 'SAVE ENTRY'}
                </button>
                <button onClick={() => { setShowEntryForm(false); setEditingEntry(null) }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 16px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>CANCEL</button>
              </div>
            </div>
          )}

          {/* Entries list */}
          {vehicle.entries.length === 0 && !showEntryForm ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.08em' }}>
              NO ENTRIES YET — START DOCUMENTING YOUR BUILD
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vehicle.entries.map((entry, i) => {
                const attachments = entry.attachments || []
                const isUploading = uploadingEntryId === entry.id
                const valueImpact = entry.estimatedValueImpact || 0
                const net = valueImpact - (entry.cost || 0)
                return (
                  <div key={entry.id} className={`fade-up delay-${Math.min(i+1,6)}`}
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1 }}>
                        <span className={`${badgeClass[entry.type]}`} style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.1em', padding: '3px 7px', borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>
                          {entry.type.toUpperCase()}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 500, fontSize: 14, color: 'var(--off-white)', marginBottom: 2 }}>{entry.title}</div>
                          {entry.description && <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.5, marginBottom: 4 }}>{entry.description}</div>}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 6, fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                            <span style={{ color: entry.cost > 0 ? 'var(--off-white)' : 'var(--gray)' }}>Cost: {entry.cost > 0 ? formatCurrency(entry.cost) : '$0'}</span>
                            <span style={{ color: financialTone(valueImpact) }}>Value Impact: {formatSignedCurrency(valueImpact)}</span>
                            <span style={{ color: financialTone(net) }}>Net: {formatSignedCurrency(net)}</span>
                          </div>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)' }}>
                            {new Date(entry.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 15, color: financialTone(net), fontWeight: 500 }}>
                          {formatSignedCurrency(net)}
                        </span>
                        <button onClick={() => openEditEntry(entry)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '4px 8px', borderRadius: 3, cursor: 'pointer' }}>EDIT</button>
                        <button onClick={() => handleDeleteEntry(entry.id)} style={{ background: 'transparent', border: '1px solid rgba(255,80,80,0.2)', color: '#ff8080', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '4px 8px', borderRadius: 3, cursor: 'pointer' }}>×</button>
                      </div>
                    </div>

                    {/* Attachments row */}
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.12em' }}>
                          PROOF / RECEIPTS ({attachments.length})
                        </div>
                        <button
                          onClick={() => attachmentInputsRef.current[entry.id]?.click()}
                          disabled={isUploading}
                          style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '4px 10px', borderRadius: 3, cursor: isUploading ? 'wait' : 'pointer', letterSpacing: '0.08em', opacity: isUploading ? 0.6 : 1 }}>
                          {isUploading ? 'UPLOADING...' : '+ ATTACH'}
                        </button>
                        <input
                          ref={el => { attachmentInputsRef.current[entry.id] = el }}
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          onChange={e => handleAttachmentUpload(entry.id, e)}
                          style={{ display: 'none' }}
                        />
                      </div>

                      {attachments.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                          {attachments.map(a => {
                            const isImage = a.type.startsWith('image/')
                            const url = attachmentUrl(a.key)
                            if (isImage) {
                              return (
                                <a key={a.key} href={url} target="_blank" rel="noopener noreferrer"
                                  title={a.name}
                                  style={{ display: 'block', width: 64, height: 64, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)', background: '#0e0e0d', flexShrink: 0 }}>
                                  <img src={url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                </a>
                              )
                            }
                            return (
                              <a key={a.key} href={url} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#0e0e0d', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', textDecoration: 'none', maxWidth: 260 }}>
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.06em', flexShrink: 0 }}>
                                  {a.type === 'application/pdf' ? 'PDF' : 'FILE'}
                                </span>
                                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--off-white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {a.name}
                                </span>
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', flexShrink: 0 }}>
                                  OPEN →
                                </span>
                              </a>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
