'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  getVehicle, updateVehicle, deleteVehicle,
  addEntry, updateEntry, deleteEntry,
  uploadPhoto, setCoverPhoto, photoUrl,
  uploadEntryAttachment, attachmentUrl,
  generateAiEvaluation,
} from '@/lib/api'
import type { Vehicle, LogEntry, MarketComp, ConditionCheckup } from '@/lib/types'

const MAKES = ['Toyota','Honda','Ford','Chevrolet','BMW','Mercedes-Benz','Audi','Nissan','Mazda','Subaru','Dodge','Jeep','Ram','GMC','Cadillac','Lexus','Acura','Infiniti','Mitsubishi','Volkswagen','Porsche','Ferrari','Lamborghini','Other']
const YEARS = Array.from({length: 2026-1980+1}, (_,i) => 2026-i)
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const HEIC_HEIF_MESSAGE = 'HEIC/HEIF images are not supported yet. Please convert to JPG or PNG.'
const IMAGE_TOO_LARGE_MESSAGE = 'Image is too large. Please use an image under 8MB.'
const FILE_TOO_LARGE_MESSAGE = 'File is too large. Please use a file under 8MB.'

function isHeicOrHeif(file: File) {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg|tiff?)$/i.test(file.name)
}

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function validateVehiclePhoto(file: File) {
  if (isHeicOrHeif(file)) return HEIC_HEIF_MESSAGE
  if (!isImageFile(file)) return 'Only image files can be uploaded.'
  if (file.size > MAX_UPLOAD_BYTES) return IMAGE_TOO_LARGE_MESSAGE
  return null
}

function validateLogAttachment(file: File) {
  if (isHeicOrHeif(file)) return HEIC_HEIF_MESSAGE
  if (!isImageFile(file) && !isPdfFile(file)) return 'Only image and PDF files can be uploaded.'
  if (file.size > MAX_UPLOAD_BYTES) return FILE_TOO_LARGE_MESSAGE
  return null
}

function formatUploadStatus(uploaded: number, failed: number) {
  const uploadedLabel = `${uploaded} ${uploaded === 1 ? 'file' : 'files'} uploaded.`
  return failed > 0 ? `${uploadedLabel} ${failed} failed.` : uploadedLabel
}

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
  const [editingCondition, setEditingCondition] = useState(false)
  const [conditionData, setConditionData] = useState<ConditionCheckup>(emptyConditionCheckup)
  const [shareConditionCheckup, setShareConditionCheckup] = useState(false)
  const [showCompForm, setShowCompForm] = useState(false)
  const [compData, setCompData] = useState(emptyCompData)
  const [bookValueInput, setBookValueInput] = useState('')
  const [aiEvaluationLoading, setAiEvaluationLoading] = useState(false)
  const [aiEvaluationError, setAiEvaluationError] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // Photo state
  const [photoLoading, setPhotoLoading] = useState(false)
  const [coverSaving, setCoverSaving] = useState<string | null>(null)
  const [activePhoto, setActivePhoto] = useState<string | null>(null)
  const [uploadingEntryId, setUploadingEntryId] = useState<string | null>(null)
  const [photoUploadStatus, setPhotoUploadStatus] = useState('')
  const [attachmentUploadStatus, setAttachmentUploadStatus] = useState<Record<string, string>>({})

  const photoRef = useRef<HTMLInputElement>(null)
  const attachmentInputsRef = useRef<Record<string, HTMLInputElement | null>>({})
  const compFormRef = useRef<HTMLDivElement>(null)
  const compSourceRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [params.id])
  useEffect(() => {
    const status = sessionStorage.getItem('vehiclePhotoUploadStatus')
    if (!status) return
    setPhotoUploadStatus(status)
    sessionStorage.removeItem('vehiclePhotoUploadStatus')
  }, [])
  useEffect(() => {
    if (!showCompForm) return
    requestAnimationFrame(() => {
      compFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      compSourceRef.current?.focus()
    })
  }, [showCompForm])

  async function load() {
    try {
      const v = await getVehicle(params.id)
      if (!v) { window.location.href = '/app'; return }
      setVehicle(v)
      setConditionData({ ...emptyConditionCheckup, ...(v.conditionCheckup || {}) })
      setShareConditionCheckup(!!v.shareConditionCheckup)
      setEditData({ year: v.year, make: v.make, model: v.model, trim: v.trim, color: v.color, mileage: v.mileage, vin: v.vin })
      setBookValueInput(typeof v.bookValue === 'number' && Number.isFinite(v.bookValue) ? String(v.bookValue) : '')
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
    if (!vehicle || !input.files?.length) {
      input.value = ''
      return
    }
    setPhotoUploadStatus('')
    try {
      const files = Array.from(input.files)
      const validFiles = files.filter(file => {
        const error = validateVehiclePhoto(file)
        if (error) {
          alert(`${file.name}: ${error}`)
          return false
        }
        return true
      })

      if (!validFiles.length) return

      setPhotoLoading(true)
      let uploadedCount = 0
      let failedCount = 0
      for (const file of validFiles) {
        try {
          console.log("Uploading file", { name: file.name, type: file.type, size: file.size })
          await uploadPhoto(vehicle.id, file)
          uploadedCount += 1
        } catch {
          failedCount += 1
          alert(`Failed to upload ${file.name}. Please try again.`)
        }
      }

      if (uploadedCount > 0) {
        const freshVehicle = await refreshVehicle(vehicle.id)
        if (freshVehicle?.photoKeys?.length) {
          setActivePhoto(freshVehicle.photoKeys[freshVehicle.photoKeys.length - 1] || null)
        }
      }
      setPhotoUploadStatus(formatUploadStatus(uploadedCount, failedCount))
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
    if (!vehicle || !input.files?.length) {
      input.value = ''
      return
    }
    setAttachmentUploadStatus(p => ({ ...p, [entryId]: '' }))
    try {
      const files = Array.from(input.files)
      const validFiles = files.filter(file => {
        const error = validateLogAttachment(file)
        if (error) {
          alert(`${file.name}: ${error}`)
          return false
        }
        return true
      })

      if (!validFiles.length) return

      setUploadingEntryId(entryId)
      let uploadedCount = 0
      let failedCount = 0
      for (const file of validFiles) {
        try {
          console.log("Uploading file", { name: file.name, type: file.type, size: file.size })
          await uploadEntryAttachment(vehicle.id, entryId, file)
          uploadedCount += 1
        } catch {
          failedCount += 1
          alert(`Failed to upload ${file.name}. Please try again.`)
        }
      }

      if (uploadedCount > 0) {
        await refreshVehicle(vehicle.id)
      }
      setAttachmentUploadStatus(p => ({ ...p, [entryId]: formatUploadStatus(uploadedCount, failedCount) }))
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

  async function handleSaveBookValue() {
    if (!vehicle) return
    const trimmedBookValue = bookValueInput.trim()
    const parsedBookValue = trimmedBookValue === '' ? null : parseFloat(trimmedBookValue)
    if (parsedBookValue !== null && (!Number.isFinite(parsedBookValue) || parsedBookValue < 0)) {
      alert('Please enter a valid book value.')
      return
    }

    setSaving(true)
    try {
      const patch = parsedBookValue === null
        ? ({ bookValue: null } as unknown as Partial<Vehicle>)
        : { bookValue: parsedBookValue }
      const updated = await updateVehicle(vehicle.id, patch)
      setVehicle(updated)
      setBookValueInput(typeof updated.bookValue === 'number' && Number.isFinite(updated.bookValue) ? String(updated.bookValue) : '')
    } catch {
      alert('Failed to save book value.')
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateAiEvaluation() {
    if (!vehicle) return
    setAiEvaluationLoading(true)
    setAiEvaluationError('')
    try {
      const aiEvaluation = await generateAiEvaluation(vehicle)
      if (!aiEvaluation) throw new Error('No evaluation returned.')
      const updated = await updateVehicle(vehicle.id, { aiEvaluation })
      setVehicle(updated)
    } catch (error) {
      setAiEvaluationError(error instanceof Error ? error.message : 'Failed to generate AI evaluation.')
    } finally {
      setAiEvaluationLoading(false)
    }
  }

  function handleToggleCompForm() {
    if (showCompForm) {
      setCompData(emptyCompData)
      setShowCompForm(false)
      return
    }
    setShowCompForm(true)
  }

  async function handleSaveConditionCheckup() {
    if (!vehicle) return
    setSaving(true)
    try {
      const sanitizedConditionCheckup = sanitizeConditionCheckup(conditionData)
      const updated = await updateVehicle(vehicle.id, {
        conditionCheckup: sanitizedConditionCheckup ? { ...sanitizedConditionCheckup, updatedAt: new Date().toISOString() } : {},
        shareConditionCheckup,
      })
      setVehicle(updated)
      setConditionData({ ...emptyConditionCheckup, ...(updated.conditionCheckup || {}) })
      setShareConditionCheckup(!!updated.shareConditionCheckup)
      setEditingCondition(false)
    } catch {
      alert('Failed to save condition checkup.')
    } finally {
      setSaving(false)
    }
  }

  function resetConditionCheckup() {
    setConditionData({ ...emptyConditionCheckup, ...(vehicle?.conditionCheckup || {}) })
    setShareConditionCheckup(!!vehicle?.shareConditionCheckup)
    setEditingCondition(false)
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
  const autoTempestTrendsUrl = `https://www.autotempest.com/trends?localization=country&make=${encodeURIComponent(vehicle.make)}&model=${encodeURIComponent(vehicle.model)}&year_buckets=${vehicle.year}&zip=27517`
  const completedConditionFields = getCompletedConditionFields(vehicle.conditionCheckup)
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
      .map(comp => comp.price)
      .filter(price => Number.isFinite(price))
  const compCount = compPrices.length
  const lowCompValue = compCount ? Math.min(...compPrices) : null
  const highCompValue = compCount ? Math.max(...compPrices) : null
  const averageCompValue = compCount ? compPrices.reduce((sum, price) => sum + price, 0) / compCount : null
  const medianCompValue = median(compPrices)
  const bookValue = typeof vehicle.bookValue === 'number' && Number.isFinite(vehicle.bookValue) && vehicle.bookValue > 0 ? vehicle.bookValue : null
  const estimatedMarketValue = medianCompValue
  const marketBookDifference = bookValue != null && estimatedMarketValue != null ? estimatedMarketValue - bookValue : null
  const marketBookPercentDiff = bookValue != null && marketBookDifference != null ? Math.round((marketBookDifference / bookValue) * 100) : null
  const latestCompMs = marketComps.reduce((latest, comp) => {
    const time = new Date(comp.dateAdded).getTime()
    return !isNaN(time) && time > latest ? time : latest
  }, 0)
  const valuationUpdatedLabel = latestCompMs > 0
    ? new Date(latestCompMs).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—'
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
        {photoUploadStatus && (
          <div style={{ position: 'absolute', bottom: 45, right: 12, background: 'rgba(10,10,9,0.75)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 9px', color: photoUploadStatus.includes('failed') ? '#f5a524' : 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.06em' }}>
            {photoUploadStatus}
          </div>
        )}
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
              {s.l === 'ESTIMATED MARKET VALUE' && (
                <div style={{ marginTop: 8, fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', color: marketConfidenceTone(marketConfidence) }}>
                  MARKET CONFIDENCE: {marketConfidence}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="fade-up delay-3" style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em' }}>— CONDITION CHECKUP</div>
            <button
              onClick={() => {
                setConditionData({ ...emptyConditionCheckup, ...(vehicle.conditionCheckup || {}) })
                setShareConditionCheckup(!!vehicle.shareConditionCheckup)
                setEditingCondition(v => !v)
              }}
              style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '6px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              {editingCondition ? 'CANCEL' : completedConditionFields.length > 0 ? 'EDIT CHECKUP' : '+ ADD CHECKUP'}
            </button>
          </div>

          {editingCondition ? (
            <div className="scale-in" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
                {conditionSelectFields.map(field => (
                  <div key={field.key}>
                    <label style={labelStyle}>{field.label.toUpperCase()}</label>
                    <select
                      value={String(conditionData[field.key] || '')}
                      onChange={e => setConditionData(p => ({ ...p, [field.key]: e.target.value }))}
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
                      const active = conditionData.oemPartsKept === option.value
                      return (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => setConditionData(p => ({ ...p, oemPartsKept: option.value }))}
                          style={{ background: active ? 'rgba(0,232,122,0.1)' : 'transparent', border: `1px solid ${active ? 'rgba(0,232,122,0.3)' : 'var(--border)'}`, color: active ? 'var(--accent)' : 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '10px 12px', borderRadius: 4, cursor: 'pointer' }}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {conditionTextFields.map(field => (
                  <div key={field.key} style={{ gridColumn: field.key === 'notes' ? 'span 2' : undefined }}>
                    <label style={labelStyle}>{field.label.toUpperCase()}</label>
                    <textarea
                      value={conditionData[field.key] || ''}
                      onChange={e => setConditionData(p => ({ ...p, [field.key]: e.target.value }))}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 16, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 6, background: '#0e0e0d' }}>
                <label style={{ ...labelStyle, marginBottom: 8 }}>PUBLIC SHARE</label>
                <button
                  type="button"
                  onClick={() => setShareConditionCheckup(v => !v)}
                  style={{ background: shareConditionCheckup ? 'rgba(0,232,122,0.1)' : 'transparent', border: `1px solid ${shareConditionCheckup ? 'rgba(0,232,122,0.3)' : 'var(--border)'}`, color: shareConditionCheckup ? 'var(--accent)' : 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '10px 12px', borderRadius: 4, cursor: 'pointer' }}
                >
                  {shareConditionCheckup ? 'INCLUDE CONDITION CHECKUP ON PUBLIC SHARE PROFILE: ON' : 'INCLUDE CONDITION CHECKUP ON PUBLIC SHARE PROFILE: OFF'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleSaveConditionCheckup} disabled={saving} style={{ background: 'var(--accent)', color: 'var(--black)', border: 'none', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 500, padding: '9px 20px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>
                  {saving ? 'SAVING...' : 'SAVE CHECKUP'}
                </button>
                <button onClick={resetConditionCheckup} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 16px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>
                  CANCEL
                </button>
              </div>
            </div>
          ) : completedConditionFields.length === 0 ? (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '22px 18px', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.08em' }}>
              NO CONDITION CHECKUP ADDED YET.
            </div>
          ) : (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.1em', color: conditionReadinessTone(conditionReadiness) }}>
                  CONDITION READINESS: {conditionReadiness}
                </div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: shareConditionCheckup ? 'var(--accent)' : 'var(--gray)', letterSpacing: '0.08em' }}>
                  PUBLIC SHARE: {shareConditionCheckup ? 'ON' : 'OFF'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
                {completedConditionFields.map(field => (
                  <div key={field.key} style={field.isLongText ? { gridColumn: '1 / -1' } : undefined}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 4 }}>
                      {field.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: field.isLongText ? 13 : 13, color: 'var(--off-white)', lineHeight: field.isLongText ? 1.6 : 1.4 }}>
                      {field.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Market comps */}
        <div className="fade-up delay-4" style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em' }}>— MARKET COMPS</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a
                href={autoTempestTrendsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: 'transparent', border: '1px solid rgba(0,232,122,0.35)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '6px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em', textDecoration: 'none' }}
              >
                FIND COMPS ON AUTOTEMPEST
              </a>
              <button
                onClick={handleToggleCompForm}
                style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '6px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}
              >
                {showCompForm ? 'CANCEL' : '+ ADD COMP'}
              </button>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.5, marginBottom: 16 }}>
            Use completed/sold listings first when possible. Asking listings are useful for context but should not drive valuation if sold comps exist.
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px', marginBottom: 16 }}>
            <label style={labelStyle}>BOOK VALUE (JD POWER / NADA)</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="number"
                value={bookValueInput}
                onChange={e => setBookValueInput(e.target.value)}
                style={{ ...inputStyle, maxWidth: 240 }}
                placeholder="Optional baseline value"
                min={0}
              />
              <button
                onClick={handleSaveBookValue}
                disabled={saving}
                style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 16px', borderRadius: 4, cursor: saving ? 'wait' : 'pointer', letterSpacing: '0.05em', opacity: saving ? 0.7 : 1 }}
              >
                SAVE BOOK VALUE
              </button>
            </div>
          </div>

          {showCompForm && (
            <div ref={compFormRef} className="scale-in" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 16 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: 'var(--off-white)', marginBottom: 16, letterSpacing: '0.03em' }}>
                NEW MARKET COMP
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 12 }}>
                <div><label style={labelStyle}>SOURCE</label>
                  <input ref={compSourceRef} value={compData.source} onChange={e => setCompData(p => ({ ...p, source: e.target.value }))} style={inputStyle} placeholder="Cars & Bids, BaT, FB Marketplace..." /></div>
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
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={handleSaveComp} disabled={saving || !compData.source || !compData.price} style={{ background: 'var(--accent)', color: 'var(--black)', border: 'none', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 500, padding: '9px 20px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em', opacity: !compData.source || !compData.price ? 0.5 : 1 }}>
                  {saving ? 'SAVING...' : 'SAVE COMP'}
                </button>
                <button onClick={() => { setShowCompForm(false); setCompData(emptyCompData) }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 16px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>CANCEL</button>
              </div>
            </div>
          )}

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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
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
            </div>
          )}

          {compCount === 0 || medianCompValue == null ? (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '22px 18px', textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--gray)', letterSpacing: '0.1em' }}>NO MARKET DATA AVAILABLE</div>
            </div>
          ) : (
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
                {formatCurrency(medianCompValue)}
              </div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray-light)', letterSpacing: '0.06em' }}>
                Based on {compCount} real market comp{compCount === 1 ? '' : 's'}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray-light)', letterSpacing: '0.06em' }}>
                <div>Estimated Range: {lowCompValue == null || highCompValue == null ? '—' : `${formatCurrency(lowCompValue)} - ${formatCurrency(highCompValue)}`}</div>
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
          )}

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
                  <div key={comp.id} style={{
                    background: comp.soldOrAsking === 'sold' ? 'rgba(0,232,122,0.04)' : 'var(--card-bg)',
                    border: `1px solid ${comp.soldOrAsking === 'sold' ? 'rgba(0,232,122,0.22)' : 'var(--border)'}`,
                    borderRadius: 6,
                    padding: '14px 16px',
                  }}>
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

        {/* AI vehicle evaluation */}
        <div className="fade-up delay-4" style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em' }}>— AI VEHICLE EVALUATION</div>
            <button
              onClick={handleGenerateAiEvaluation}
              disabled={aiEvaluationLoading}
              style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '6px 14px', borderRadius: 4, cursor: aiEvaluationLoading ? 'wait' : 'pointer', letterSpacing: '0.05em', opacity: aiEvaluationLoading ? 0.7 : 1 }}
            >
              {aiEvaluationLoading ? 'GENERATING...' : 'GENERATE AI EVALUATION'}
            </button>
          </div>

          {aiEvaluationError && (
            <div style={{ background: 'rgba(255,77,79,0.08)', border: '1px solid rgba(255,77,79,0.3)', borderRadius: 6, color: '#ff8080', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '10px 12px', marginBottom: 12, letterSpacing: '0.04em' }}>
              {aiEvaluationError}
            </div>
          )}

          {vehicle.aiEvaluation ? (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.08em', marginBottom: 14 }}>
                GENERATED {new Date(vehicle.aiEvaluation.generatedAt).toLocaleString()}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 16 }}>
                {[
                  { label: 'OVERALL SUMMARY', value: vehicle.aiEvaluation.overallSummary },
                  { label: 'MARKET POSITION', value: vehicle.aiEvaluation.marketPosition },
                  { label: 'CONDITION SUMMARY', value: vehicle.aiEvaluation.conditionSummary },
                  { label: 'PROOF STRENGTH', value: vehicle.aiEvaluation.proofStrength },
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--off-white)', lineHeight: 1.55 }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
                <div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#ff8080', letterSpacing: '0.1em', marginBottom: 6 }}>RISKS</div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.6 }}>
                    {vehicle.aiEvaluation.risks.map((risk, index) => <li key={index}>{risk}</li>)}
                  </ul>
                </div>
                <div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 6 }}>RECOMMENDED NEXT STEPS</div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.6 }}>
                    {vehicle.aiEvaluation.recommendedNextSteps.map((step, index) => <li key={index}>{step}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '18px 20px', color: 'var(--gray)', fontSize: 13, lineHeight: 1.5 }}>
              Generate an AI evaluation from this vehicle&apos;s current profile, condition checkup, proof files, build logs, value impact, and market comps. This is not a certified appraisal.
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
                const attachmentStatus = attachmentUploadStatus[entry.id]
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
                      {attachmentStatus && (
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: attachmentStatus.includes('failed') ? '#f5a524' : 'var(--accent)', marginTop: 8, letterSpacing: '0.06em' }}>
                          {attachmentStatus}
                        </div>
                      )}

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
