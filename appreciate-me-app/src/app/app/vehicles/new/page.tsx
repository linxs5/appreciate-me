'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { createVehicle, uploadPhoto } from '@/lib/api'

const MAKES = ['Toyota','Honda','Ford','Chevrolet','BMW','Mercedes-Benz','Audi','Nissan','Mazda','Subaru','Dodge','Jeep','Ram','GMC','Cadillac','Lexus','Acura','Infiniti','Mitsubishi','Volkswagen','Porsche','Ferrari','Lamborghini','Other']
const YEARS = Array.from({length: 2026-1980+1}, (_,i) => 2026-i)

export default function NewVehiclePage() {
  const [form, setForm] = useState({ year: 2024, make: '', model: '', trim: '', color: '', mileage: '', vin: '' })
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string,string>>({})
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (k: string, v: string | number) => setForm(p => ({...p, [k]: v}))

  function validate() {
    const e: Record<string,string> = {}
    if (!form.year) e.year = 'Required'
    if (!form.make) e.make = 'Required'
    if (!form.model.trim()) e.model = 'Required'
    if (form.mileage && (isNaN(+form.mileage) || +form.mileage < 0 || +form.mileage > 999999)) e.mileage = '0–999,999'
    if (form.vin && form.vin.length !== 17) e.vin = 'Must be 17 characters'
    return e
  }

  async function handleSubmit() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      const vehicle = await createVehicle({
        year: +form.year, make: form.make, model: form.model,
        trim: form.trim || undefined, color: form.color || undefined,
        mileage: form.mileage ? +form.mileage : 0,
        vin: form.vin || undefined,
      })
      if (photo) {
        try { await uploadPhoto(vehicle.id, photo) } catch {}
      }
      window.location.href = `/app/vehicles/${vehicle.id}`
    } catch {
      alert('Failed to add vehicle. Please try again.')
    } finally { setSaving(false) }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPhoto(f)
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(f)
  }

  const inputStyle: React.CSSProperties = {
    background: '#111110', border: '1px solid var(--border)', borderRadius: 4,
    color: 'var(--off-white)', padding: '11px 13px', width: '100%',
    fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)',
    letterSpacing: '0.1em', display: 'block', marginBottom: 6,
  }
  const errStyle: React.CSSProperties = {
    fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#ff8080',
    marginTop: 4, letterSpacing: '0.06em',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(10,10,9,0.92)', backdropFilter: 'blur(12px)', zIndex: 50 }}>
        <Link href="/app" style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--off-white)', textDecoration: 'none' }}>
          Appreciate<span style={{ color: 'var(--accent)' }}>.</span>Me
        </Link>
        <Link href="/app" style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)', textDecoration: 'none', letterSpacing: '0.05em' }}>← GARAGE</Link>
      </nav>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— NEW VEHICLE</div>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(32px,6vw,52px)', color: 'var(--off-white)', letterSpacing: '0.02em', lineHeight: 1 }}>ADD A VEHICLE</h1>
          <p style={{ color: 'var(--gray)', fontSize: 14, marginTop: 8 }}>Start documenting. Add logs and photos any time.</p>
        </div>

        <div className="fade-up delay-1" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '28px 24px' }}>
          {/* Photo upload */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>VEHICLE PHOTO (OPTIONAL)</label>
            <div onClick={() => fileRef.current?.click()} style={{ border: '1px dashed var(--border)', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0e0e0d', transition: 'border-color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(200,240,0,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              {photoPreview ? (
                <img src={photoPreview} style={{ width: '100%', height: 200, objectFit: 'cover' }} alt="preview" />
              ) : (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: 'var(--gray)', marginBottom: 6 }}>+</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.1em' }}>CLICK TO UPLOAD</div>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
          </div>

          {/* Form grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>YEAR *</label>
              <select value={form.year} onChange={e => set('year', +e.target.value)} style={inputStyle}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {errors.year && <div style={errStyle}>{errors.year}</div>}
            </div>
            <div>
              <label style={labelStyle}>MAKE *</label>
              <select value={form.make} onChange={e => { set('make', e.target.value); setErrors(p => ({...p, make: ''})) }} style={inputStyle}>
                <option value="">Select make</option>
                {MAKES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              {errors.make && <div style={errStyle}>{errors.make}</div>}
            </div>
            <div>
              <label style={labelStyle}>MODEL *</label>
              <input value={form.model} onChange={e => { set('model', e.target.value); setErrors(p => ({...p, model: ''})) }} style={inputStyle} placeholder="e.g. Ranger" />
              {errors.model && <div style={errStyle}>{errors.model}</div>}
            </div>
            <div>
              <label style={labelStyle}>TRIM</label>
              <input value={form.trim} onChange={e => set('trim', e.target.value)} style={inputStyle} placeholder="e.g. XLT Turbo" />
            </div>
            <div>
              <label style={labelStyle}>COLOR</label>
              <input value={form.color} onChange={e => set('color', e.target.value)} style={inputStyle} placeholder="e.g. Oxford White" />
            </div>
            <div>
              <label style={labelStyle}>MILEAGE</label>
              <input type="number" value={form.mileage} onChange={e => { set('mileage', e.target.value); setErrors(p => ({...p, mileage: ''})) }} style={inputStyle} placeholder="e.g. 78000" min={0} max={999999} />
              {errors.mileage && <div style={errStyle}>{errors.mileage}</div>}
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={labelStyle}>VIN (OPTIONAL — 17 CHARACTERS)</label>
              <input value={form.vin} onChange={e => { set('vin', e.target.value.toUpperCase()); setErrors(p => ({...p, vin: ''})) }} style={inputStyle} placeholder="e.g. 1FTFW1ET5EKE12345" maxLength={17} />
              {form.vin && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: form.vin.length === 17 ? 'var(--accent)' : 'var(--gray)', marginTop: 4 }}>{form.vin.length}/17</div>}
              {errors.vin && <div style={errStyle}>{errors.vin}</div>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button onClick={handleSubmit} disabled={saving} style={{ flex: 1, background: 'var(--accent)', color: 'var(--black)', border: 'none', fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: '0.04em', padding: '12px 24px', borderRadius: 4, cursor: 'pointer', transition: 'background 0.2s', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'ADDING...' : 'ADD VEHICLE'}
            </button>
            <Link href="/app" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 12, padding: '12px 20px', borderRadius: 4, textDecoration: 'none', display: 'flex', alignItems: 'center', letterSpacing: '0.05em' }}>
              CANCEL
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
