'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createVehicle, uploadPhoto } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import type { ConditionCheckup } from '@/lib/types'

const COMMON_MAKES = [
  'Acura','Alfa Romeo','Audi','BMW','Buick','Cadillac','Chevrolet','Chrysler',
  'Dodge','Fiat','Ford','Genesis','GMC','Honda','Hyundai','Infiniti','Jaguar',
  'Jeep','Kia','Land Rover','Lexus','Lincoln','Mazda','Mercedes-Benz','Mini',
  'Mitsubishi','Nissan','Porsche','Ram','Subaru','Tesla','Toyota','Volkswagen','Volvo',
]
const YEARS = Array.from({length: 2026-1980+1}, (_,i) => 2026-i)
const MAX_IMAGE_FALLBACK_BYTES = 15 * 1024 * 1024
const OPTIMIZED_IMAGE_MAX_DIMENSION = 1800
const OPTIMIZED_IMAGE_TYPE = 'image/jpeg'
const OPTIMIZED_IMAGE_QUALITY = 0.82
const HEIC_HEIF_MESSAGE = 'HEIC/HEIF images are not supported yet. Please convert to JPG or PNG.'
const IMAGE_TOO_LARGE_MESSAGE = 'This image is too large to upload. Please choose a smaller image or screenshot.'
const VPIC_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles'

type VpicResult = Record<string, string | number | null | undefined>
type PhotoUploadFailure = { file: File; reason: string }

const MODEL_EXCLUDE_PATTERN = /\b(trailer|chassis|incomplete|motorhome|bus|coach|body|equipment|dolly|semitrailer|semi-trailer|converter|tow|wrecker|tractor|truck-tractor|glider|low speed|lsv|off road|atv|snowmobile|motorcycle)\b/i

function normalizeVehicleOption(value: unknown) {
  if (typeof value !== 'string') return ''
  return value
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map(part => /^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join('')
    .replace(/\bBmw\b/g, 'BMW')
    .replace(/\bGmc\b/g, 'GMC')
}

function uniqueSortedOptions(values: unknown[]) {
  return Array.from(new Set(values.map(normalizeVehicleOption).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
}

function filterModelOptions(values: unknown[]) {
  return uniqueSortedOptions(values).filter(model => !MODEL_EXCLUDE_PATTERN.test(model))
}

async function fetchVpicResults(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('NHTSA request failed')
  const data = await res.json()
  return Array.isArray(data.Results) ? data.Results as VpicResult[] : []
}

async function fetchModelsForYearMake(year: number, make: string, signal: AbortSignal) {
  const url = `${VPIC_BASE}/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`
  const models = await fetchVpicResults(url, signal)
  return filterModelOptions(models.map(result => result.Model_Name || result.ModelName || result.Model))
}

function isHeicOrHeif(file: File) {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg|tiff?)$/i.test(file.name)
}

function validateVehiclePhoto(file: File) {
  if (isHeicOrHeif(file)) return HEIC_HEIF_MESSAGE
  if (!isImageFile(file)) return 'Only image files can be uploaded.'
  return null
}

function optimizedImageName(file: File) {
  return file.name.replace(/\.[^.]+$/, '') + '.jpg'
}

async function loadImageElement(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Image could not be loaded.'))
      image.src = url
    })
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function compressImageForUpload(file: File) {
  try {
    const image = await loadImageElement(file)
    const scale = Math.min(
      1,
      OPTIMIZED_IMAGE_MAX_DIMENSION / image.naturalWidth,
      OPTIMIZED_IMAGE_MAX_DIMENSION / image.naturalHeight
    )
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image compression is unavailable.')
    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, OPTIMIZED_IMAGE_TYPE, OPTIMIZED_IMAGE_QUALITY)
    })
    if (!blob) throw new Error('Image compression failed.')
    return new File([blob], optimizedImageName(file), {
      type: OPTIMIZED_IMAGE_TYPE,
      lastModified: Date.now(),
    })
  } catch (error) {
    if (file.size <= MAX_IMAGE_FALLBACK_BYTES) return file
    throw error
  }
}

function cleanUploadError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || '')
  if (raw.includes('Unsupported file type')) return 'Unsupported image type.'
  if (raw.includes('Unauthorized')) return 'Please sign in again.'
  if (raw.includes('Forbidden')) return 'You do not have access to this vehicle.'
  if (raw.includes('too large') || raw.includes('large')) return IMAGE_TOO_LARGE_MESSAGE
  return 'Upload failed. Please try again.'
}

function formatUploadStatus(uploaded: number, total: number, failures: PhotoUploadFailure[]) {
  const lines = [`Uploaded ${uploaded} of ${total} photos.`]
  if (failures.length > 0) {
    lines.push(...failures.map(failure => `${failure.file.name}: ${failure.reason}`))
  }
  return lines.join('\n')
}

const emptyConditionCheckup: ConditionCheckup = {
  exterior: '',
  interior: '',
  mechanical: '',
  titleStatus: '',
  rust: '',
  leaks: '',
  warningLights: '',
  tires: '',
  brakes: '',
  acHeat: '',
  transmission: '',
  frameCondition: '',
  paintCondition: '',
  interiorWear: '',
  accidentHistory: '',
  knownIssues: '',
  recentService: '',
  modifications: '',
  notes: '',
}

const conditionSelectFields: Array<{ key: keyof ConditionCheckup; label: string; options: Array<{ value: string; label: string }> }> = [
  { key: 'exterior', label: 'Exterior', options: [{ value: 'excellent', label: 'Excellent' }, { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }] },
  { key: 'interior', label: 'Interior', options: [{ value: 'excellent', label: 'Excellent' }, { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }] },
  { key: 'mechanical', label: 'Mechanical', options: [{ value: 'excellent', label: 'Excellent' }, { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }] },
  { key: 'titleStatus', label: 'Title', options: [{ value: 'clean', label: 'Clean' }, { value: 'rebuilt', label: 'Rebuilt' }, { value: 'salvage', label: 'Salvage' }, { value: 'unknown', label: 'Unknown' }] },
  { key: 'rust', label: 'Rust', options: [{ value: 'none', label: 'None' }, { value: 'minor', label: 'Minor' }, { value: 'moderate', label: 'Moderate' }, { value: 'severe', label: 'Severe' }, { value: 'unknown', label: 'Unknown' }] },
  { key: 'leaks', label: 'Leaks', options: [{ value: 'none', label: 'None' }, { value: 'minor', label: 'Minor' }, { value: 'major', label: 'Major' }, { value: 'unknown', label: 'Unknown' }] },
  { key: 'warningLights', label: 'Warning Lights', options: [{ value: 'none', label: 'None' }, { value: 'check_engine', label: 'Check Engine' }, { value: 'multiple', label: 'Multiple' }, { value: 'unknown', label: 'Unknown' }] },
  { key: 'tires', label: 'Tires', options: [{ value: 'new', label: 'New' }, { value: 'good', label: 'Good' }, { value: 'worn', label: 'Worn' }, { value: 'needs_replacement', label: 'Needs Replacement' }, { value: 'unknown', label: 'Unknown' }] },
  { key: 'brakes', label: 'Brakes', options: [{ value: 'new', label: 'New' }, { value: 'good', label: 'Good' }, { value: 'worn', label: 'Worn' }, { value: 'needs_service', label: 'Needs Service' }, { value: 'unknown', label: 'Unknown' }] },
  { key: 'acHeat', label: 'AC / Heat', options: [{ value: 'works', label: 'Works' }, { value: 'partial', label: 'Partial' }, { value: 'not_working', label: 'Not Working' }, { value: 'unknown', label: 'Unknown' }] },
  { key: 'transmission', label: 'Transmission', options: [{ value: 'smooth', label: 'Smooth' }, { value: 'minor_issues', label: 'Minor Issues' }, { value: 'major_issues', label: 'Major Issues' }, { value: 'unknown', label: 'Unknown' }] },
  { key: 'frameCondition', label: 'Frame', options: [{ value: 'excellent', label: 'Excellent' }, { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'rusty', label: 'Rusty' }, { value: 'unknown', label: 'Unknown' }] },
  { key: 'paintCondition', label: 'Paint', options: [{ value: 'excellent', label: 'Excellent' }, { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }, { value: 'unknown', label: 'Unknown' }] },
  { key: 'interiorWear', label: 'Interior Wear', options: [{ value: 'minimal', label: 'Minimal' }, { value: 'normal', label: 'Normal' }, { value: 'heavy', label: 'Heavy' }, { value: 'unknown', label: 'Unknown' }] },
  { key: 'accidentHistory', label: 'Accident History', options: [{ value: 'none_known', label: 'None Known' }, { value: 'minor', label: 'Minor' }, { value: 'major', label: 'Major' }, { value: 'unknown', label: 'Unknown' }] },
]

const conditionTextFields: Array<{ key: 'knownIssues' | 'recentService' | 'modifications' | 'notes'; label: string; placeholder: string }> = [
  { key: 'knownIssues', label: 'Known Issues', placeholder: 'Optional' },
  { key: 'recentService', label: 'Recent Service', placeholder: 'Optional' },
  { key: 'modifications', label: 'Modifications', placeholder: 'Optional' },
  { key: 'notes', label: 'Notes', placeholder: 'Optional' },
]

function sanitizeConditionCheckup(conditionCheckup: ConditionCheckup): ConditionCheckup | undefined {
  const cleaned: ConditionCheckup = {}

  Object.entries(conditionCheckup).forEach(([key, value]) => {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) cleaned[key as keyof ConditionCheckup] = trimmed as never
      return
    }
    if (typeof value === 'boolean') {
      cleaned[key as keyof ConditionCheckup] = value as never
    }
  })

  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}

export default function NewVehiclePage() {
  const [form, setForm] = useState({ year: 2024, make: '', model: '', trim: '', color: '', mileage: '', vin: '' })
  const [showConditionCheckup, setShowConditionCheckup] = useState(false)
  const [conditionCheckup, setConditionCheckup] = useState<ConditionCheckup>(emptyConditionCheckup)
  const [shareConditionCheckup, setShareConditionCheckup] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState('')
  const [errors, setErrors] = useState<Record<string,string>>({})
  const [saving, setSaving] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelSuggestionsUnavailable, setModelSuggestionsUnavailable] = useState(false)
  const [failedPhotoUploads, setFailedPhotoUploads] = useState<PhotoUploadFailure[]>([])
  const [createdVehicleId, setCreatedVehicleId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (k: string, v: string | number) => setForm(p => ({...p, [k]: v}))

  useEffect(() => {
    getCurrentUser()
      .then(user => {
        if (!user) window.location.href = '/app/login'
        else setAuthChecked(true)
      })
      .catch(() => { window.location.href = '/app/login' })
  }, [])

  useEffect(() => {
    setModelOptions([])
    setModelSuggestionsUnavailable(false)
    if (!form.make.trim()) {
      setLoadingModels(false)
      return
    }

    const controller = new AbortController()
    setLoadingModels(true)

    fetchModelsForYearMake(+form.year, form.make.trim(), controller.signal)
      .then(options => {
        setModelOptions(options)
        setModelSuggestionsUnavailable(options.length === 0)
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setModelOptions([])
        setModelSuggestionsUnavailable(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingModels(false)
      })

    return () => controller.abort()
  }, [form.year, form.make])

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
    setUploadStatus('')
    setFailedPhotoUploads([])
    try {
      const vehicle = createdVehicleId
        ? { id: createdVehicleId }
        : await createVehicle({
            year: +form.year, make: form.make, model: form.model,
            trim: form.trim || undefined, color: form.color || undefined,
            mileage: form.mileage ? +form.mileage : 0,
            vin: form.vin || undefined,
            conditionCheckup: (() => {
              const sanitizedConditionCheckup = sanitizeConditionCheckup(conditionCheckup)
              return sanitizedConditionCheckup ? { ...sanitizedConditionCheckup, updatedAt: new Date().toISOString() } : undefined
            })(),
            shareConditionCheckup,
          })
      setCreatedVehicleId(vehicle.id)
      if (photos.length) {
        let uploadedCount = 0
        const failures: PhotoUploadFailure[] = []
        for (const photo of photos) {
          try {
            const uploadFile = await compressImageForUpload(photo)
            await uploadPhoto(vehicle.id, uploadFile)
            uploadedCount += 1
          } catch (error) {
            failures.push({ file: photo, reason: cleanUploadError(error) })
          }
        }
        const status = formatUploadStatus(uploadedCount, photos.length, failures)
        setUploadStatus(status)
        setFailedPhotoUploads(failures)
        sessionStorage.setItem('vehiclePhotoUploadStatus', status)
        if (failures.length > 0) return
      }
      window.location.href = `/app/vehicles/${vehicle.id}`
    } catch {
      alert('Failed to add vehicle. Please try again.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
      setSaving(false)
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const selectedPhotos = Array.from(e.target.files || [])
    if (!selectedPhotos.length) return
    setUploadStatus('')
    setFailedPhotoUploads([])
    const validPhotos = selectedPhotos.filter(photo => {
      const error = validateVehiclePhoto(photo)
      if (error) {
        alert(`${photo.name}: ${error}`)
        return false
      }
      return true
    })

    if (!validPhotos.length) {
      setPhotos([])
      setPhotoPreview(null)
      input.value = ''
      return
    }

    setPhotos(validPhotos)
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(validPhotos[0])
  }

  async function retryFailedPhotoUploads() {
    if (!failedPhotoUploads.length) return
    const retryPhotos = failedPhotoUploads.map(failure => failure.file)
    setPhotos(retryPhotos)
    setFailedPhotoUploads([])
    setUploadStatus(`${retryPhotos.length} failed photo${retryPhotos.length === 1 ? '' : 's'} ready to retry. Submit again to upload them.`)
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
      {!authChecked ? (
        <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, padding: 40, textAlign: 'center' }}>CHECKING ACCOUNT...</div>
      ) : (
      <>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 'var(--app-nav-height, 56px)', background: 'rgba(10,10,9,0.92)', backdropFilter: 'blur(12px)', zIndex: 50 }}>
        <Link href="/app" style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', textDecoration: 'none', letterSpacing: '0.1em' }}>
          ← GARAGE
        </Link>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.1em' }}>NEW VEHICLE</div>
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
            <input ref={fileRef} type="file" multiple accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', marginTop: 8, letterSpacing: '0.06em' }}>
              Large photos are automatically optimized before upload.
            </div>
            {uploadStatus && (
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: failedPhotoUploads.length > 0 ? '#f5a524' : 'var(--accent)', marginTop: 8, letterSpacing: '0.06em', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {uploadStatus}
              </div>
            )}
            {failedPhotoUploads.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={retryFailedPhotoUploads}
                  style={{ background: 'transparent', border: '1px solid #f5a524', color: '#f5a524', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '7px 10px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.06em' }}
                >
                  RETRY FAILED PHOTOS
                </button>
                {createdVehicleId && (
                  <Link href={`/app/vehicles/${createdVehicleId}`} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '7px 10px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.06em' }}>
                    CONTINUE TO VEHICLE
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Form grid */}
          <div style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.5, marginBottom: 14 }}>
            Common makes are suggested below. You can still type any make or model manually.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>YEAR *</label>
              <select
                value={form.year}
                onChange={e => {
                  setForm(p => ({ ...p, year: +e.target.value, make: '', model: '' }))
                  setErrors(p => ({ ...p, make: '', model: '' }))
                }}
                style={inputStyle}
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {errors.year && <div style={errStyle}>{errors.year}</div>}
            </div>
            <div>
              <label style={labelStyle}>MAKE *</label>
              <input
                value={form.make}
                list="vehicle-make-options"
                onChange={e => {
                  setForm(p => ({ ...p, make: e.target.value, model: '' }))
                  setErrors(p => ({...p, make: '', model: ''}))
                }}
                style={inputStyle}
                placeholder="Select or type make"
              />
              <datalist id="vehicle-make-options">
                {COMMON_MAKES.map(make => <option key={make} value={make} />)}
              </datalist>
              {errors.make && <div style={errStyle}>{errors.make}</div>}
            </div>
            <div>
              <label style={labelStyle}>MODEL *</label>
              <input
                value={form.model}
                list="vehicle-model-options"
                onChange={e => { set('model', e.target.value); setErrors(p => ({...p, model: ''})) }}
                style={inputStyle}
                placeholder={loadingModels ? 'Loading models...' : 'Select or type model'}
              />
              <datalist id="vehicle-model-options">
                {modelOptions.map(model => <option key={model} value={model} />)}
              </datalist>
              {loadingModels && <div style={{ ...errStyle, color: 'var(--gray)' }}>Loading models...</div>}
              {modelSuggestionsUnavailable && !loadingModels && <div style={{ ...errStyle, color: 'var(--gray)' }}>Model suggestions unavailable. You can still type the model manually.</div>}
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

          <div style={{ marginTop: 24, paddingTop: 22, borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setShowConditionCheckup(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--off-white)', padding: '12px 14px', cursor: 'pointer' }}
            >
              <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.03em' }}>OPTIONAL CONDITION CHECKUP</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray)' }}>{showConditionCheckup ? 'HIDE' : 'ADD'}</span>
            </button>
            <div style={{ color: 'var(--gray)', fontSize: 13, marginTop: 10 }}>
              Optional, but helps create a stronger valuation and buyer proof packet later.
            </div>

            {showConditionCheckup && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
                  {conditionSelectFields.map(field => (
                    <div key={field.key}>
                      <label style={labelStyle}>{field.label.toUpperCase()}</label>
                      <select
                        value={String(conditionCheckup[field.key] || '')}
                        onChange={e => setConditionCheckup(p => ({ ...p, [field.key]: e.target.value }))}
                        style={inputStyle}
                      >
                        <option value="">Skip</option>
                        {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                  ))}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={labelStyle}>OEM PARTS KEPT</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { label: 'Unknown / Skip', value: undefined },
                        { label: 'Yes', value: true },
                        { label: 'No', value: false },
                      ].map(option => {
                        const active = conditionCheckup.oemPartsKept === option.value
                        return (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => setConditionCheckup(p => ({ ...p, oemPartsKept: option.value }))}
                            style={{ background: active ? 'rgba(0,232,122,0.1)' : 'transparent', border: `1px solid ${active ? 'rgba(0,232,122,0.3)' : 'var(--border)'}`, color: active ? 'var(--accent)' : 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '10px 12px', borderRadius: 4, cursor: 'pointer' }}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {conditionTextFields.map(field => (
                    <div key={field.key} style={{ gridColumn: field.key === 'notes' ? 'span 2' : undefined }}>
                      <label style={labelStyle}>{field.label.toUpperCase()}</label>
                      <textarea
                        value={conditionCheckup[field.key] || ''}
                        onChange={e => setConditionCheckup(p => ({ ...p, [field.key]: e.target.value }))}
                        style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }}
                        placeholder={field.placeholder}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 6, background: '#0e0e0d' }}>
                  <label style={{ ...labelStyle, marginBottom: 8 }}>PUBLIC SHARE</label>
                  <button
                    type="button"
                    onClick={() => setShareConditionCheckup(v => !v)}
                    style={{ background: shareConditionCheckup ? 'rgba(0,232,122,0.1)' : 'transparent', border: `1px solid ${shareConditionCheckup ? 'rgba(0,232,122,0.3)' : 'var(--border)'}`, color: shareConditionCheckup ? 'var(--accent)' : 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '10px 12px', borderRadius: 4, cursor: 'pointer' }}
                  >
                    {shareConditionCheckup ? 'INCLUDE CONDITION CHECKUP ON PUBLIC SHARE PROFILE: ON' : 'INCLUDE CONDITION CHECKUP ON PUBLIC SHARE PROFILE: OFF'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button onClick={handleSubmit} disabled={saving} style={{ flex: 1, background: 'var(--accent)', color: 'var(--black)', border: 'none', fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: '0.04em', padding: '12px 24px', borderRadius: 4, cursor: 'pointer', transition: 'background 0.2s', opacity: saving ? 0.7 : 1 }}>
              {saving ? (createdVehicleId ? 'UPLOADING...' : 'ADDING...') : createdVehicleId ? 'RETRY PHOTO UPLOADS' : 'ADD VEHICLE'}
            </button>
            <Link href="/app" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 12, padding: '12px 20px', borderRadius: 4, textDecoration: 'none', display: 'flex', alignItems: 'center', letterSpacing: '0.05em' }}>
              CANCEL
            </Link>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
