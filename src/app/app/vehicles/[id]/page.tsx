'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { getVehicle, updateVehicle, deleteVehicle, addEntry, updateEntry, deleteEntry, uploadPhoto, uploadEntryAttachment, photoUrl, attachmentUrl, totalInvested } from '@/lib/api'
import type { Vehicle, LogEntry } from '@/lib/types'

const MAKES = ['Toyota','Honda','Ford','Chevrolet','BMW','Mercedes-Benz','Audi','Nissan','Mazda','Subaru','Dodge','Jeep','Ram','GMC','Cadillac','Lexus','Acura','Infiniti','Mitsubishi','Volkswagen','Porsche','Ferrari','Lamborghini','Other']
const YEARS = Array.from({length: 2026-1980+1}, (_,i) => 2026-i)

export default function VehiclePage({ params }: { params: { id: string } }) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Vehicle>>({})
  const [showDelete, setShowDelete] = useState(false)
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null)
  const [entryData, setEntryData] = useState({ type: 'maintenance' as LogEntry['type'], title: '', cost: '', date: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [uploadingEntryId, setUploadingEntryId] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const attachmentInputsRef = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    load()
  }, [params.id])

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
    try {
      await deleteVehicle(params.id)
    } catch {}
    window.location.href = '/app'
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!vehicle || !e.target.files?.[0]) return
    setPhotoLoading(true)
    try {
      const key = await uploadPhoto(vehicle.id, e.target.files[0])
      const newKeys = vehicle.photoKeys?.length > 0
        ? [key, ...vehicle.photoKeys.slice(1)]
        : [key]
      const updated = await updateVehicle(vehicle.id, { photoKeys: newKeys })
      setVehicle(updated)
    } catch { alert('Photo upload failed. Try again.') }
    finally { setPhotoLoading(false) }
  }

  async function handleSaveEntry() {
    if (!vehicle) return
    setSaving(true)
    try {
      let updated: Vehicle
      if (editingEntry) {
        updated = await updateEntry(vehicle.id, editingEntry.id, {
          type: entryData.type,
          title: entryData.title,
          cost: parseFloat(entryData.cost) || 0,
          date: entryData.date,
          description: entryData.description,
        })
      } else {
        updated = await addEntry(vehicle.id, {
          type: entryData.type,
          title: entryData.title,
          cost: parseFloat(entryData.cost) || 0,
          date: entryData.date,
          description: entryData.description,
        })
      }
      setVehicle(updated)
      setShowEntryForm(false)
      setEditingEntry(null)
      setEntryData({ type: 'maintenance', title: '', cost: '', date: '', description: '' })
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
    if (!vehicle || !e.target.files?.[0]) return
    const file = e.target.files[0]
    e.target.value = ''
    setUploadingEntryId(entryId)
    try {
      await uploadEntryAttachment(vehicle.id, entryId, file)
      // Refetch to get the updated entry with new attachment metadata
      const fresh = await getVehicle(vehicle.id)
      if (fresh) setVehicle(fresh)
    } catch {
      alert('Attachment upload failed. Try again.')
    } finally {
      setUploadingEntryId(null)
    }
  }

  function openEditEntry(entry: LogEntry) {
    setEditingEntry(entry)
    setEntryData({ type: entry.type, title: entry.title, cost: String(entry.cost), date: entry.date, description: entry.description || '' })
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
        {vehicle.photoKeys?.[0] ? (
          <img src={photoUrl(vehicle.photoKeys[0])} alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} className="hero-photo" />
        ) : (
          <div style={{ aspectRatio: '16/9', maxHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111110' }}>
            <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.1em' }}>NO PHOTO</div>
          </div>
        )}
        <button onClick={() => photoRef.current?.click()} disabled={photoLoading}
          style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(10,10,9,0.75)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', color: 'var(--off-white)', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '6px 12px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.08em' }}>
          {photoLoading ? 'UPLOADING...' : vehicle.photoKeys?.[0] ? '↺ CHANGE PHOTO' : '+ ADD PHOTO'}
        </button>
        <input ref={photoRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {/* Vehicle header */}
        <div className="fade-up" style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— VEHICLE PROFILE</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            {editing ? (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>YEAR</label>
                    <select value={editData.year} onChange={e => setEditData(p => ({...p, year: +e.target.value}))} style={inputStyle}>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>MAKE</label>
                    <select value={editData.make} onChange={e => setEditData(p => ({...p, make: e.target.value}))} style={inputStyle}>
                      {MAKES.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>MODEL</label>
                    <input value={editData.model || ''} onChange={e => setEditData(p => ({...p, model: e.target.value}))} style={inputStyle} placeholder="e.g. Ranger" />
                  </div>
                  <div>
                    <label style={labelStyle}>TRIM</label>
                    <input value={editData.trim || ''} onChange={e => setEditData(p => ({...p, trim: e.target.value}))} style={inputStyle} placeholder="e.g. XLT" />
                  </div>
                  <div>
                    <label style={labelStyle}>COLOR</label>
                    <input value={editData.color || ''} onChange={e => setEditData(p => ({...p, color: e.target.value}))} style={inputStyle} placeholder="e.g. Black" />
                  </div>
                  <div>
                    <label style={labelStyle}>MILEAGE</label>
                    <input type="number" value={editData.mileage || ''} onChange={e => setEditData(p => ({...p, mileage: +e.target.value}))} style={inputStyle} min={0} max={999999} />
                  </div>
                  <div>
                    <label style={labelStyle}>VIN (OPTIONAL)</label>
                    <input value={editData.vin || ''} onChange={e => setEditData(p => ({...p, vin: e.target.value}))} style={inputStyle} placeholder="17 chars" maxLength={17} />
                  </div>
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
                  <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '8px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em', transition: 'border-color 0.2s' }}>EDIT</button>
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
        <div className="fade-up delay-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 36 }}>
          {[
            { l: 'TOTAL INVESTED', v: `$${totalInvested(vehicle.entries).toLocaleString()}` },
            { l: 'MILEAGE', v: vehicle.mileage?.toLocaleString(), sub: 'miles' },
            { l: 'LOG ENTRIES', v: vehicle.entries.length },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 18px' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 6 }}>{s.l}</div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, color: 'var(--off-white)', lineHeight: 1 }}>{s.v}</div>
              {s.sub && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', marginTop: 3 }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Build log */}
        <div className="fade-up delay-3">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em' }}>— BUILD LOG</div>
            <button onClick={() => { setShowEntryForm(true); setEditingEntry(null); setEntryData({ type: 'maintenance', title: '', cost: '', date: new Date().toISOString().split('T')[0], description: '' }) }}
              style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '6px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em', transition: 'background 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,240,0,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
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
                <div>
                  <label style={labelStyle}>TYPE</label>
                  <select value={entryData.type} onChange={e => setEntryData(p => ({...p, type: e.target.value as LogEntry['type']}))} style={inputStyle}>
                    <option value="maintenance">Maintenance</option>
                    <option value="repair">Repair</option>
                    <option value="mod">Mod</option>
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>TITLE</label>
                  <input value={entryData.title} onChange={e => setEntryData(p => ({...p, title: e.target.value}))} style={inputStyle} placeholder="e.g. Oil Change — Mobil 1 5W-30" />
                </div>
                <div>
                  <label style={labelStyle}>COST ($)</label>
                  <input type="number" value={entryData.cost} onChange={e => setEntryData(p => ({...p, cost: e.target.value}))} style={inputStyle} placeholder="0.00" min={0} />
                </div>
                <div>
                  <label style={labelStyle}>DATE</label>
                  <input type="date" value={entryData.date} onChange={e => setEntryData(p => ({...p, date: e.target.value}))} style={inputStyle} />
                </div>
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
                return (
                  <div key={entry.id} className={`fade-up delay-${Math.min(i+1,6)}`}
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1 }}>
                        <span className={`${badgeClass[entry.type]}`} style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.1em', padding: '3px 7px', borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>
                          {entry.type.toUpperCase()}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 500, fontSize: 14, color: 'var(--off-white)', marginBottom: 2 }}>{entry.title}</div>
                          {entry.description && <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.5, marginBottom: 4 }}>{entry.description}</div>}
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)' }}>
                            {new Date(entry.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 15, color: entry.cost > 0 ? 'var(--off-white)' : 'var(--gray)', fontWeight: 500 }}>
                          {entry.cost > 0 ? `$${entry.cost.toLocaleString()}` : '—'}
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
