'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  getVehicle, updateVehicle, deleteVehicle,
  addEntry, updateEntry, deleteEntry,
  uploadPhoto, setCoverPhoto, photoUrl,
  uploadEntryAttachment, attachmentUrl,
  generateAiEvaluation,
  generateVisualIdentity, visualIdentityUrl,
  reportError,
} from '@/lib/api'
import type { Vehicle, LogEntry, MarketComp, ConditionCheckup, VehicleOwnership, VehicleValueTask } from '@/lib/types'

const MAKES = ['Toyota','Honda','Ford','Chevrolet','BMW','Mercedes-Benz','Audi','Nissan','Mazda','Subaru','Dodge','Jeep','Ram','GMC','Cadillac','Lexus','Acura','Infiniti','Mitsubishi','Volkswagen','Porsche','Ferrari','Lamborghini','Other']
const YEARS = Array.from({length: 2026-1980+1}, (_,i) => 2026-i)
const MAX_IMAGE_FALLBACK_BYTES = 15 * 1024 * 1024
const MAX_PDF_UPLOAD_BYTES = 15 * 1024 * 1024
const OPTIMIZED_IMAGE_MAX_DIMENSION = 1800
const OPTIMIZED_IMAGE_TYPE = 'image/jpeg'
const OPTIMIZED_IMAGE_QUALITY = 0.82
const HEIC_HEIF_MESSAGE = 'HEIC/HEIF images are not supported yet. Please convert to JPG or PNG.'
const IMAGE_TOO_LARGE_MESSAGE = 'This image is too large to upload. Please choose a smaller image or screenshot.'
const FILE_TOO_LARGE_MESSAGE = 'File is too large. Please use a file under 15MB.'
const VISUAL_IDENTITY_GENERATION_LIMIT = 3
const VISUAL_IDENTITY_LOADING_STEPS = [
  'Generating digital identity...',
  'Enhancing lighting...',
  'Refining details...',
  'Preparing asset card...',
]

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
  return null
}

function validateLogAttachment(file: File) {
  if (isHeicOrHeif(file)) return HEIC_HEIF_MESSAGE
  if (!isImageFile(file) && !isPdfFile(file)) return 'Only image and PDF files can be uploaded.'
  if (isPdfFile(file) && file.size > MAX_PDF_UPLOAD_BYTES) return FILE_TOO_LARGE_MESSAGE
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

async function prepareUploadFile(file: File) {
  if (!isImageFile(file)) return file
  return compressImageForUpload(file)
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

const emptyMileageForecastData = {
  baselineMileage: '',
  baselineDate: '',
  averageWeeklyMiles: '',
  suggestedMileage: '',
}

const emptyOwnershipData = {
  purchasePrice: '',
  purchaseDate: '',
  ownershipStatus: '' as VehicleOwnership['ownershipStatus'],
  loanBalance: '',
  monthlyPayment: '',
  interestRate: '',
  lender: '',
  notes: '',
}

const emptyValueTaskData = {
  title: '',
  category: 'maintenance' as NonNullable<VehicleValueTask['category']>,
  estimatedCost: '',
  priority: 'medium' as NonNullable<VehicleValueTask['priority']>,
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

function hasConditionData(conditionCheckup?: ConditionCheckup) {
  if (!conditionCheckup) return false
  return Object.entries(conditionCheckup).some(([key, value]) => {
    if (key === 'updatedAt') return false
    if (typeof value === 'boolean') return true
    return typeof value === 'string' && value.trim() !== ''
  })
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

function parseOptionalNumber(value: string) {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = parseFloat(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function sanitizeOwnership(ownership: typeof emptyOwnershipData): VehicleOwnership | undefined {
  const cleaned: VehicleOwnership = {}
  const purchasePrice = parseOptionalNumber(ownership.purchasePrice)
  const loanBalance = parseOptionalNumber(ownership.loanBalance)
  const monthlyPayment = parseOptionalNumber(ownership.monthlyPayment)
  const interestRate = parseOptionalNumber(ownership.interestRate)

  if (purchasePrice !== undefined) cleaned.purchasePrice = purchasePrice
  if (ownership.purchaseDate) cleaned.purchaseDate = ownership.purchaseDate
  if (ownership.ownershipStatus) cleaned.ownershipStatus = ownership.ownershipStatus
  if (loanBalance !== undefined) cleaned.loanBalance = loanBalance
  if (monthlyPayment !== undefined) cleaned.monthlyPayment = monthlyPayment
  if (interestRate !== undefined) cleaned.interestRate = interestRate
  if (ownership.lender.trim()) cleaned.lender = ownership.lender.trim()
  if (ownership.notes.trim()) cleaned.notes = ownership.notes.trim()

  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}

function hasOwnershipData(ownership?: VehicleOwnership) {
  if (!ownership) return false
  return Object.entries(ownership).some(([key, value]) => {
    if (key === 'updatedAt') return false
    if (typeof value === 'number') return Number.isFinite(value)
    return typeof value === 'string' && value.trim() !== ''
  })
}

const ownershipStatusLabels: Record<NonNullable<VehicleOwnership['ownershipStatus']>, string> = {
  owned_outright: 'Owned Outright',
  financed: 'Financed',
  leased: 'Leased',
  other: 'Other',
  '': '',
}

function getCompletedOwnershipFields(ownership?: VehicleOwnership) {
  if (!ownership) return []
  const fields = [
    typeof ownership.purchasePrice === 'number' && Number.isFinite(ownership.purchasePrice)
      ? { key: 'purchasePrice', label: 'Purchase Price', value: formatCurrency(ownership.purchasePrice) }
      : null,
    ownership.purchaseDate
      ? { key: 'purchaseDate', label: 'Purchase Date', value: new Date(`${ownership.purchaseDate}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) }
      : null,
    ownership.ownershipStatus
      ? { key: 'ownershipStatus', label: 'Ownership Status', value: ownershipStatusLabels[ownership.ownershipStatus] || ownership.ownershipStatus }
      : null,
    typeof ownership.loanBalance === 'number' && Number.isFinite(ownership.loanBalance)
      ? { key: 'loanBalance', label: 'Loan Balance', value: formatCurrency(ownership.loanBalance) }
      : null,
    typeof ownership.monthlyPayment === 'number' && Number.isFinite(ownership.monthlyPayment)
      ? { key: 'monthlyPayment', label: 'Monthly Payment', value: formatCurrency(ownership.monthlyPayment) }
      : null,
    typeof ownership.interestRate === 'number' && Number.isFinite(ownership.interestRate)
      ? { key: 'interestRate', label: 'Interest Rate', value: `${ownership.interestRate}%` }
      : null,
    ownership.lender
      ? { key: 'lender', label: 'Lender', value: ownership.lender }
      : null,
    ownership.notes
      ? { key: 'notes', label: 'Notes', value: ownership.notes, isLongText: true }
      : null,
  ]
  return fields.filter((field): field is { key: string; label: string; value: string; isLongText?: boolean } => field !== null)
}

function formatCurrency(value: number) {
  return `$${Math.abs(value).toLocaleString()}`
}

function formatWholeCurrency(value: number) {
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

function valueTaskPriorityTone(priority?: VehicleValueTask['priority']) {
  if (priority === 'high') return '#ff4d4f'
  if (priority === 'medium') return '#f5a524'
  return '#8aa39a'
}

function valueTaskPriorityBg(priority?: VehicleValueTask['priority']) {
  if (priority === 'high') return 'rgba(255,77,79,0.08)'
  if (priority === 'medium') return 'rgba(245,165,36,0.08)'
  return 'rgba(0,232,122,0.055)'
}

function valueTaskCategoryLabel(category?: VehicleValueTask['category']) {
  if (!category) return 'Other'
  return category.charAt(0).toUpperCase() + category.slice(1)
}

async function completeValueTask(vehicleId: string, taskId: string, convertToLog: boolean): Promise<Vehicle> {
  const res = await fetch(`/.netlify/functions/vehicle?id=${vehicleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'complete-value-task', taskId, convertToLog }),
  })
  if (!res.ok) throw new Error('Failed to complete value task')
  return res.json()
}

function timelineTypeTone(type: 'OWNERSHIP' | 'LOG' | 'TASK' | 'MARKET COMP' | 'CONDITION') {
  if (type === 'OWNERSHIP') return '#00e87a'
  if (type === 'LOG') return '#8fd9b6'
  if (type === 'TASK') return '#f5a524'
  if (type === 'MARKET COMP') return '#7cc7ff'
  return '#b7b7ad'
}

function marketConfidenceTone(confidence: 'HIGH' | 'MEDIUM' | 'LOW') {
  if (confidence === 'HIGH') return '#00e87a'
  if (confidence === 'MEDIUM') return '#f5a524'
  return '#ff4d4f'
}

function getProofStrength(proofFilesCount: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (proofFilesCount >= 5) return 'HIGH'
  if (proofFilesCount >= 2) return 'MEDIUM'
  return 'LOW'
}

function carIdentityGlowStyle(confidence: 'HIGH' | 'MEDIUM' | 'LOW'): React.CSSProperties {
  if (confidence === 'HIGH') {
    return {
      border: '1px solid rgba(0,232,122,0.42)',
      boxShadow: '0 0 46px rgba(0,232,122,0.16), 0 18px 60px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.05)',
    }
  }
  if (confidence === 'MEDIUM') {
    return {
      border: '1px solid rgba(245,165,36,0.32)',
      boxShadow: '0 0 34px rgba(245,165,36,0.1), 0 0 26px rgba(0,232,122,0.06), 0 18px 54px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.045)',
    }
  }
  return {
    border: '1px solid rgba(255,77,79,0.22)',
    boxShadow: '0 0 28px rgba(255,77,79,0.08), 0 0 18px rgba(0,232,122,0.035), 0 16px 48px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)',
  }
}

function cleanVisualIdentityErrorMessage(error: unknown) {
  const rawError = String(error).toLowerCase()
  if (rawError.includes('response_format') || rawError.includes('unknown_parameter')) {
    return 'Visual identity generation failed because the image API request format is invalid. Please try again after the fix is deployed.'
  }
  if (rawError.includes('insufficient_quota')) {
    return 'Visual identity generation is temporarily unavailable because the AI account has no available credits.'
  }
  return 'Visual identity generation failed. Please try again later.'
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

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function daysBetweenDates(fromDate: string, toDate = todayDateInputValue()) {
  const start = new Date(`${fromDate}T00:00:00`).getTime()
  const end = new Date(`${toDate}T00:00:00`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, (end - start) / (1000 * 60 * 60 * 24))
}

function calculateMileageSuggestion(baselineMileage: number, baselineDate: string, averageWeeklyMiles?: number) {
  const weeklyMiles = typeof averageWeeklyMiles === 'number' && Number.isFinite(averageWeeklyMiles) ? averageWeeklyMiles : 0
  const weeksSinceBaseline = daysBetweenDates(baselineDate) / 7
  return Math.round(baselineMileage + weeklyMiles * weeksSinceBaseline)
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
  const [editingOwnership, setEditingOwnership] = useState(false)
  const [ownershipData, setOwnershipData] = useState(emptyOwnershipData)
  const [showValueTaskForm, setShowValueTaskForm] = useState(false)
  const [valueTaskData, setValueTaskData] = useState(emptyValueTaskData)
  const [editingCondition, setEditingCondition] = useState(false)
  const [conditionData, setConditionData] = useState<ConditionCheckup>(emptyConditionCheckup)
  const [shareConditionCheckup, setShareConditionCheckup] = useState(false)
  const [showCompForm, setShowCompForm] = useState(false)
  const [compData, setCompData] = useState(emptyCompData)
  const [bookValueInput, setBookValueInput] = useState('')
  const [editingMileageForecast, setEditingMileageForecast] = useState(false)
  const [mileageForecastData, setMileageForecastData] = useState(emptyMileageForecastData)
  const [aiEvaluationLoading, setAiEvaluationLoading] = useState(false)
  const [aiEvaluationError, setAiEvaluationError] = useState('')
  const [visualIdentityLoading, setVisualIdentityLoading] = useState(false)
  const [visualIdentityError, setVisualIdentityError] = useState('')
  const [visualIdentityLoadingStep, setVisualIdentityLoadingStep] = useState(0)
  const [identityImageMode, setIdentityImageMode] = useState<'original' | 'ai'>('original')
  const [cardSummaryCopied, setCardSummaryCopied] = useState(false)
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
  useEffect(() => {
    if (!visualIdentityLoading) {
      setVisualIdentityLoadingStep(0)
      return
    }
    const interval = window.setInterval(() => {
      setVisualIdentityLoadingStep(step => (step + 1) % VISUAL_IDENTITY_LOADING_STEPS.length)
    }, 1600)
    return () => window.clearInterval(interval)
  }, [visualIdentityLoading])
  useEffect(() => {
    if (vehicle?.visualIdentity) setIdentityImageMode('ai')
  }, [vehicle?.visualIdentity?.imageKey])

  async function load() {
    try {
      const v = await getVehicle(params.id)
      if (!v) { window.location.href = '/app'; return }
      setVehicle(v)
      setOwnershipData({
        purchasePrice: v.ownership?.purchasePrice == null ? '' : String(v.ownership.purchasePrice),
        purchaseDate: v.ownership?.purchaseDate || '',
        ownershipStatus: v.ownership?.ownershipStatus || '',
        loanBalance: v.ownership?.loanBalance == null ? '' : String(v.ownership.loanBalance),
        monthlyPayment: v.ownership?.monthlyPayment == null ? '' : String(v.ownership.monthlyPayment),
        interestRate: v.ownership?.interestRate == null ? '' : String(v.ownership.interestRate),
        lender: v.ownership?.lender || '',
        notes: v.ownership?.notes || '',
      })
      setConditionData({ ...emptyConditionCheckup, ...(v.conditionCheckup || {}) })
      setShareConditionCheckup(!!v.shareConditionCheckup)
      setEditData({ year: v.year, make: v.make, model: v.model, trim: v.trim, color: v.color, mileage: v.mileage, vin: v.vin })
      setBookValueInput(typeof v.bookValue === 'number' && Number.isFinite(v.bookValue) ? String(v.bookValue) : '')
      const forecast = v.mileageForecast
      setMileageForecastData(forecast ? {
        baselineMileage: String(forecast.baselineMileage),
        baselineDate: forecast.baselineDate,
        averageWeeklyMiles: forecast.averageWeeklyMiles == null ? '' : String(forecast.averageWeeklyMiles),
        suggestedMileage: String(calculateMileageSuggestion(forecast.baselineMileage, forecast.baselineDate, forecast.averageWeeklyMiles)),
      } : {
        baselineMileage: typeof v.mileage === 'number' && Number.isFinite(v.mileage) ? String(v.mileage) : '',
        baselineDate: todayDateInputValue(),
        averageWeeklyMiles: '',
        suggestedMileage: '',
      })
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
          const uploadFile = await prepareUploadFile(file)
          console.log("Uploading file", { name: uploadFile.name, type: uploadFile.type, size: uploadFile.size })
          await uploadPhoto(vehicle.id, uploadFile)
          uploadedCount += 1
        } catch (error) {
          failedCount += 1
          if (error instanceof Error) console.error(error)
          if (isImageFile(file) && file.size > MAX_IMAGE_FALLBACK_BYTES) {
            alert(`${file.name}: ${IMAGE_TOO_LARGE_MESSAGE}`)
            continue
          }
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
          const uploadFile = await prepareUploadFile(file)
          console.log("Uploading file", { name: uploadFile.name, type: uploadFile.type, size: uploadFile.size })
          await uploadEntryAttachment(vehicle.id, entryId, uploadFile)
          uploadedCount += 1
        } catch (error) {
          failedCount += 1
          if (error instanceof Error) console.error(error)
          if (isImageFile(file) && file.size > MAX_IMAGE_FALLBACK_BYTES) {
            alert(`${file.name}: ${IMAGE_TOO_LARGE_MESSAGE}`)
            continue
          }
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

  async function handleSaveOwnership() {
    if (!vehicle) return
    const ownership = sanitizeOwnership(ownershipData)
    setSaving(true)
    try {
      const updated = await updateVehicle(vehicle.id, {
        ownership: ownership ? { ...ownership, updatedAt: new Date().toISOString() } : {},
      })
      setVehicle(updated)
      setOwnershipData({
        purchasePrice: updated.ownership?.purchasePrice == null ? '' : String(updated.ownership.purchasePrice),
        purchaseDate: updated.ownership?.purchaseDate || '',
        ownershipStatus: updated.ownership?.ownershipStatus || '',
        loanBalance: updated.ownership?.loanBalance == null ? '' : String(updated.ownership.loanBalance),
        monthlyPayment: updated.ownership?.monthlyPayment == null ? '' : String(updated.ownership.monthlyPayment),
        interestRate: updated.ownership?.interestRate == null ? '' : String(updated.ownership.interestRate),
        lender: updated.ownership?.lender || '',
        notes: updated.ownership?.notes || '',
      })
      setEditingOwnership(false)
    } catch {
      alert('Failed to save ownership details.')
    } finally {
      setSaving(false)
    }
  }

  function resetOwnership() {
    setOwnershipData({
      purchasePrice: vehicle?.ownership?.purchasePrice == null ? '' : String(vehicle.ownership.purchasePrice),
      purchaseDate: vehicle?.ownership?.purchaseDate || '',
      ownershipStatus: vehicle?.ownership?.ownershipStatus || '',
      loanBalance: vehicle?.ownership?.loanBalance == null ? '' : String(vehicle.ownership.loanBalance),
      monthlyPayment: vehicle?.ownership?.monthlyPayment == null ? '' : String(vehicle.ownership.monthlyPayment),
      interestRate: vehicle?.ownership?.interestRate == null ? '' : String(vehicle.ownership.interestRate),
      lender: vehicle?.ownership?.lender || '',
      notes: vehicle?.ownership?.notes || '',
    })
    setEditingOwnership(false)
  }

  async function handleAddValueTask() {
    if (!vehicle) return
    const title = valueTaskData.title.trim()
    if (!title) return
    const estimatedCost = parseOptionalNumber(valueTaskData.estimatedCost)
    const nextTask: VehicleValueTask = {
      id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}`,
      title,
      category: valueTaskData.category,
      estimatedCost,
      priority: valueTaskData.priority,
      notes: valueTaskData.notes.trim() || undefined,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    setSaving(true)
    try {
      const updated = await updateVehicle(vehicle.id, {
        valueTasks: [...(vehicle.valueTasks || []), nextTask],
      })
      setVehicle(updated)
      setValueTaskData(emptyValueTaskData)
      setShowValueTaskForm(false)
    } catch {
      alert('Failed to save value task.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCompleteValueTask(task: VehicleValueTask) {
    if (!vehicle || task.status === 'completed') return
    const convertToLog = confirm('Convert this completed task into a build log entry?')
    setSaving(true)
    try {
      const updated = await completeValueTask(vehicle.id, task.id, convertToLog)
      setVehicle(updated)
    } catch {
      alert('Failed to complete value task.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteValueTask(taskId: string) {
    if (!vehicle || !confirm('Remove this value task?')) return
    setSaving(true)
    try {
      const updated = await updateVehicle(vehicle.id, {
        valueTasks: (vehicle.valueTasks || []).filter(task => task.id !== taskId),
      })
      setVehicle(updated)
    } catch {
      alert('Failed to delete value task.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveMileageForecast() {
    if (!vehicle) return
    const baselineMileage = parseFloat(mileageForecastData.baselineMileage)
    const averageWeeklyMiles = parseFloat(mileageForecastData.averageWeeklyMiles)
    const baselineDate = mileageForecastData.baselineDate

    if (!Number.isFinite(baselineMileage) || baselineMileage < 0) {
      alert('Please enter a valid baseline mileage.')
      return
    }
    if (!baselineDate) {
      alert('Please enter a baseline date.')
      return
    }
    if (!Number.isFinite(averageWeeklyMiles) || averageWeeklyMiles < 0) {
      alert('Please enter valid average weekly miles.')
      return
    }

    setSaving(true)
    try {
      const mileageForecast = {
        ...(vehicle.mileageForecast || {}),
        baselineMileage,
        baselineDate,
        averageWeeklyMiles,
      }
      const updated = await updateVehicle(vehicle.id, { mileageForecast })
      const suggestedMileage = calculateMileageSuggestion(baselineMileage, baselineDate, averageWeeklyMiles)
      setVehicle(updated)
      setMileageForecastData({
        baselineMileage: String(baselineMileage),
        baselineDate,
        averageWeeklyMiles: String(averageWeeklyMiles),
        suggestedMileage: String(suggestedMileage),
      })
      setEditingMileageForecast(false)
    } catch {
      alert('Failed to save mileage forecast.')
    } finally {
      setSaving(false)
    }
  }

  async function handleApproveMileageUpdate(suggestedMileage: number) {
    if (!vehicle?.mileageForecast) return
    const overrideMileage = mileageForecastData.suggestedMileage.trim() === ''
      ? suggestedMileage
      : parseFloat(mileageForecastData.suggestedMileage)
    if (!Number.isFinite(overrideMileage) || overrideMileage < 0) {
      alert('Please enter a valid suggested mileage.')
      return
    }
    const approvedMileage = Math.round(overrideMileage)
    if (!confirm(`Update saved mileage to ${approvedMileage.toLocaleString()} miles?`)) return

    setSaving(true)
    try {
      const now = new Date().toISOString()
      const updated = await updateVehicle(vehicle.id, {
        mileage: approvedMileage,
        mileageForecast: {
          ...vehicle.mileageForecast,
          lastSuggestedMileage: approvedMileage,
          lastSuggestedAt: now,
        },
      })
      setVehicle(updated)
      setEditData(p => ({ ...p, mileage: updated.mileage }))
      setMileageForecastData(p => ({
        ...p,
        suggestedMileage: String(approvedMileage),
      }))
    } catch {
      alert('Failed to update mileage.')
    } finally {
      setSaving(false)
    }
  }

  function editMileageForecast() {
    if (!vehicle) return
    const forecast = vehicle.mileageForecast
    setMileageForecastData(forecast ? {
      baselineMileage: String(forecast.baselineMileage),
      baselineDate: forecast.baselineDate,
      averageWeeklyMiles: forecast.averageWeeklyMiles == null ? '' : String(forecast.averageWeeklyMiles),
      suggestedMileage: String(calculateMileageSuggestion(forecast.baselineMileage, forecast.baselineDate, forecast.averageWeeklyMiles)),
    } : {
      baselineMileage: typeof vehicle.mileage === 'number' && Number.isFinite(vehicle.mileage) ? String(vehicle.mileage) : '',
      baselineDate: todayDateInputValue(),
      averageWeeklyMiles: '',
      suggestedMileage: '',
    })
    setEditingMileageForecast(true)
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

  async function handleGenerateVisualIdentity() {
    if (!vehicle) return
    const generationCount = vehicle.visualIdentity ? vehicle.visualIdentity.generationCount || 1 : 0
    if (generationCount >= VISUAL_IDENTITY_GENERATION_LIMIT) {
      setVisualIdentityError('Visual identity generation limit reached for this vehicle.')
      return
    }
    setVisualIdentityLoading(true)
    setVisualIdentityError('')
    try {
      const visualIdentity = await generateVisualIdentity(vehicle)
      if (!visualIdentity) throw new Error('No visual identity returned.')
      const updated = await updateVehicle(vehicle.id, { visualIdentity })
      setVehicle(updated)
    } catch (error) {
      console.error(error)
      const cleanErrorMessage = cleanVisualIdentityErrorMessage(error)
      setVisualIdentityError(cleanErrorMessage)
      reportError({
        message: cleanErrorMessage,
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        createdAt: new Date().toISOString(),
        extra: {
          feature: 'visual_identity_generation',
          rawError: String(error),
        },
      }).catch(() => {})
    } finally {
      setVisualIdentityLoading(false)
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

  function copyCardSummary() {
    if (!vehicle) return
    const proofFilesCount = vehicle.entries.reduce((sum, entry) => sum + (entry.attachments?.length || 0), 0)
    const marketComps = vehicle.marketComps || []
    const soldPrices = marketComps
      .filter(comp => comp.soldOrAsking === 'sold')
      .map(comp => comp.price)
      .filter(price => Number.isFinite(price))
    const compPrices = soldPrices.length > 0
      ? soldPrices
      : marketComps
        .map(comp => comp.price)
        .filter(price => Number.isFinite(price))
    const estimatedValue = median(compPrices)
    const soldCompCount = marketComps.filter(c => c.soldOrAsking === 'sold').length
    const confidence = soldCompCount >= 5 ? 'HIGH' : soldCompCount >= 2 ? 'MEDIUM' : 'LOW'
    const condition = hasConditionData(vehicle.conditionCheckup) ? getConditionReadiness(vehicle.conditionCheckup) : 'Not added yet.'
    const proofStrength = getProofStrength(proofFilesCount)
    const aiValuationRange = vehicle.aiEvaluation?.valuationRange
    const summary = [
      `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      '',
      `Estimated Value: ${estimatedValue == null ? 'No data' : formatWholeCurrency(estimatedValue)}`,
      aiValuationRange ? `AI Range: ${formatWholeCurrency(aiValuationRange.low)} – ${formatWholeCurrency(aiValuationRange.high)}` : null,
      `Market Confidence: ${confidence}`,
      '',
      `Condition: ${condition}`,
      vehicle.mileage ? `Mileage: ${vehicle.mileage.toLocaleString()} mi` : null,
      '',
      `Proof Strength: ${proofStrength} (${proofFilesCount} ${proofFilesCount === 1 ? 'file' : 'files'})`,
      '',
      'Built and tracked with Appreciate Me',
    ].filter((line): line is string => line !== null).join('\n')

    navigator.clipboard.writeText(summary).catch(() => {
      const el = document.createElement('textarea')
      el.value = summary
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCardSummaryCopied(true)
    setTimeout(() => setCardSummaryCopied(false), 2000)
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
  const proofFilesCount = vehicle.entries.reduce((sum, entry) => sum + (entry.attachments?.length || 0), 0)
  const proofStrength = getProofStrength(proofFilesCount)
  const totalInvested = vehicle.entries.reduce((sum, entry) => sum + (entry.cost || 0), 0)
  const totalImpact = vehicle.entries.reduce((sum, entry) => sum + (entry.estimatedValueImpact || 0), 0)
  const netPosition = totalImpact - totalInvested
  const ownership = vehicle.ownership
  const completedOwnershipFields = getCompletedOwnershipFields(ownership)
  const ownsOutright = ownership?.ownershipStatus === 'owned_outright'
  const hasLoanBalance = typeof ownership?.loanBalance === 'number' && Number.isFinite(ownership.loanBalance)
  const loanBalanceForEquity = ownsOutright ? 0 : hasLoanBalance ? ownership.loanBalance : null
  const estimatedEquity = estimatedMarketValue != null && loanBalanceForEquity != null
    ? estimatedMarketValue - loanBalanceForEquity
    : null
  const hasPurchasePrice = typeof ownership?.purchasePrice === 'number' && Number.isFinite(ownership.purchasePrice)
  const purchasePriceForPosition = hasPurchasePrice ? ownership?.purchasePrice ?? null : null
  const ownerPosition = estimatedMarketValue != null && purchasePriceForPosition != null
    ? estimatedMarketValue - purchasePriceForPosition - totalInvested
    : null
  const aiValuationRange = vehicle.aiEvaluation?.valuationRange
  const carSpeaksInsight = vehicle.aiEvaluation?.overallSummary || 'This vehicle’s identity is built from its proof, condition, and market data.'
  const visualIdentity = vehicle.visualIdentity
  const visualIdentityGenerationCount = visualIdentity ? visualIdentity.generationCount || 1 : 0
  const visualIdentityLimitReached = visualIdentityGenerationCount >= VISUAL_IDENTITY_GENERATION_LIMIT
  const showAiIdentityImage = identityImageMode === 'ai' && !!visualIdentity
  const originalIdentityPhotoKey = coverPhotoKey || heroKey
  const entriesWithProof = vehicle.entries.filter(entry => (entry.attachments || []).length > 0)
  const recordsWithProof = entriesWithProof.length
  const recordsMissingProof = vehicle.entries.length - recordsWithProof
  const proofCoverage = vehicle.entries.length > 0 ? Math.round((recordsWithProof / vehicle.entries.length) * 100) : 0
  const proofScoreChecks = [
    {
      key: 'logs',
      label: 'Logs',
      complete: vehicle.entries.length >= 3,
      points: 20,
      reason: vehicle.entries.length >= 3 ? `${vehicle.entries.length} log records documented` : `${vehicle.entries.length}/3 log records documented`,
      nextStep: 'Add at least 3 log records.',
    },
    {
      key: 'attachments',
      label: 'Attachments',
      complete: vehicle.entries.length > 0 && proofCoverage >= 50,
      points: 20,
      reason: vehicle.entries.length === 0 ? 'No log records available for proof attachments' : `${proofCoverage}% of logs have proof attached`,
      nextStep: 'Add proof attachments to more log entries.',
    },
    {
      key: 'marketComps',
      label: 'Market comps',
      complete: marketComps.length >= 3,
      points: 15,
      reason: marketComps.length >= 3 ? `${marketComps.length} market comps added` : `${marketComps.length}/3 market comps added`,
      nextStep: 'Add at least 3 market comps.',
    },
    {
      key: 'soldComps',
      label: 'Sold comps',
      complete: soldCompCount >= 2,
      points: 15,
      reason: soldCompCount >= 2 ? `${soldCompCount} sold comps added` : `${soldCompCount}/2 sold comps added`,
      nextStep: 'Add at least 2 sold market comps.',
    },
    {
      key: 'condition',
      label: 'Condition data',
      complete: completedConditionFields.length >= 5,
      points: 10,
      reason: completedConditionFields.length >= 5 ? `${completedConditionFields.length} condition fields completed` : `${completedConditionFields.length}/5 condition fields completed`,
      nextStep: 'Add condition checkup.',
    },
    {
      key: 'ownership',
      label: 'Ownership data',
      complete: !!ownership && (hasPurchasePrice || !!ownership.purchaseDate),
      points: 10,
      reason: !!ownership && (hasPurchasePrice || !!ownership.purchaseDate) ? 'Purchase details documented' : 'Purchase price or purchase date missing',
      nextStep: 'Add ownership details.',
    },
    {
      key: 'photos',
      label: 'Photos',
      complete: galleryKeys.length >= 3,
      points: 10,
      reason: galleryKeys.length >= 3 ? `${galleryKeys.length} photos added` : `${galleryKeys.length}/3 photos added`,
      nextStep: 'Add more photos.',
    },
  ]
  const proofDocumentationScore = Math.min(100, proofScoreChecks.reduce((score, check) => score + (check.complete ? check.points : 0), 0))
  const proofDocumentationLabel = proofDocumentationScore >= 80
    ? 'STRONG DOCUMENTATION'
    : proofDocumentationScore >= 50
      ? 'MODERATE DOCUMENTATION'
      : 'WEAK DOCUMENTATION'
  const proofDocumentationTone = proofDocumentationScore >= 80
    ? '#00e87a'
    : proofDocumentationScore >= 50
      ? '#f5a524'
      : '#ff4d4f'
  const proofNextSteps = proofScoreChecks.filter(check => !check.complete).map(check => check.nextStep)
  const valueTasks = vehicle.valueTasks || []
  const sortedValueTasks = [...valueTasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
  const pendingValueTaskCount = valueTasks.filter(task => task.status === 'pending').length
  const completedValueTaskCount = valueTasks.filter(task => task.status === 'completed').length
  const timelineEvents = [
    ...(vehicle.ownership?.purchaseDate ? [{
      id: 'ownership-purchase',
      date: vehicle.ownership.purchaseDate,
      type: 'OWNERSHIP' as const,
      title: 'Purchased vehicle',
      detail: vehicle.ownership.ownershipStatus ? ownershipStatusLabels[vehicle.ownership.ownershipStatus] || vehicle.ownership.ownershipStatus : 'Ownership record',
      amount: typeof vehicle.ownership.purchasePrice === 'number' && Number.isFinite(vehicle.ownership.purchasePrice) ? formatCurrency(vehicle.ownership.purchasePrice) : undefined,
    }] : []),
    ...vehicle.entries.map(entry => {
      const valueImpact = entry.estimatedValueImpact == null ? null : entry.estimatedValueImpact
      const detailParts = [
        entry.type.charAt(0).toUpperCase() + entry.type.slice(1),
        valueImpact == null ? null : `Value impact ${formatSignedCurrency(valueImpact)}`,
      ].filter(Boolean)
      return {
        id: `log-${entry.id}`,
        date: entry.date,
        type: 'LOG' as const,
        title: entry.title,
        detail: detailParts.join(' · ') || 'Build log entry',
        amount: entry.cost > 0 ? formatCurrency(entry.cost) : undefined,
      }
    }),
    ...valueTasks
      .filter(task => task.status === 'completed' && task.completedAt)
      .map(task => ({
        id: `task-${task.id}`,
        date: task.completedAt || task.createdAt,
        type: 'TASK' as const,
        title: task.title,
        detail: `${valueTaskCategoryLabel(task.category)} task completed`,
        amount: task.estimatedCost == null ? undefined : formatCurrency(task.estimatedCost),
      })),
    ...marketComps.map(comp => ({
      id: `comp-${comp.id}`,
      date: comp.dateAdded,
      type: 'MARKET COMP' as const,
      title: comp.source,
      detail: `${comp.soldOrAsking.toUpperCase()} comp${comp.mileage == null ? '' : ` · ${comp.mileage.toLocaleString()} mi`}`,
      amount: formatCurrency(comp.price),
      soldOrAsking: comp.soldOrAsking,
    })),
    ...(vehicle.conditionCheckup?.updatedAt ? [{
      id: 'condition-updated',
      date: vehicle.conditionCheckup.updatedAt,
      type: 'CONDITION' as const,
      title: 'Condition checkup updated',
      detail: `Condition readiness: ${conditionReadiness}`,
      amount: undefined,
    }] : []),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const mileageForecast = vehicle.mileageForecast
  const mileageForecastWeeks = mileageForecast ? daysBetweenDates(mileageForecast.baselineDate) / 7 : 0
  const suggestedMileage = mileageForecast
    ? calculateMileageSuggestion(mileageForecast.baselineMileage, mileageForecast.baselineDate, mileageForecast.averageWeeklyMiles)
    : null
  const mileageForecastLastCalculated = todayDateInputValue()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      <style jsx global>{`
        .vehicle-subnav {
          top: var(--app-nav-height, 56px) !important;
        }

        .car-identity-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .car-identity-action {
          min-height: 36px;
        }

        .car-identity-card {
          transform-style: preserve-3d;
          transition: transform 260ms ease, filter 260ms ease, box-shadow 260ms ease, border-color 260ms ease;
          will-change: transform;
        }

        .car-identity-shine {
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.07) 42%, transparent 62%);
          transform: translateX(-115%);
          transition: transform 900ms ease;
          pointer-events: none;
          z-index: 1;
        }

        @media (hover: hover) and (pointer: fine) {
          .car-identity-card:hover {
            transform: perspective(1100px) translateY(-5px) rotateX(1.2deg) rotateY(-1deg) !important;
            filter: drop-shadow(0 18px 34px rgba(0,232,122,0.12));
          }

          .car-identity-card:hover .car-identity-shine {
            transform: translateX(115%);
          }
        }

        @media (hover: none), (pointer: coarse) {
          .car-identity-card {
            transition: transform 180ms ease, filter 180ms ease;
          }

          .car-identity-card:active {
            transform: scale(0.998) !important;
            filter: drop-shadow(0 8px 18px rgba(0,232,122,0.08));
          }

          .car-identity-shine {
            transform: translateX(-20%);
            opacity: 0.55;
          }
        }

        .car-identity-media {
          height: clamp(280px, 42vw, 520px);
          max-height: 60vh;
        }

        .car-identity-media img {
          max-width: 100%;
          max-height: 100%;
          object-position: center;
        }

        @media (max-width: 640px) {
          .vehicle-subnav {
            padding: 0 14px !important;
            min-height: 48px !important;
            height: 48px !important;
          }

          .vehicle-subnav-actions {
            gap: 6px !important;
          }

          .vehicle-subnav-actions > * {
            font-size: 9px !important;
            padding: 6px 9px !important;
          }

          .car-identity-header {
            align-items: stretch !important;
          }

          .car-identity-header-copy {
            min-width: 100%;
          }

          .car-identity-actions {
            display: grid !important;
            grid-template-columns: 1fr;
            width: 100%;
            justify-content: stretch;
          }

          .car-identity-action {
            width: 100%;
            min-height: 40px;
            text-align: center;
          }

          .car-identity-card {
            border-radius: 10px !important;
            transform: none !important;
          }

          .car-identity-media {
            height: clamp(240px, 72vw, 380px) !important;
            max-height: 60vh !important;
          }

          .car-identity-toggle {
            top: 10px !important;
            right: 10px !important;
            max-width: calc(100% - 20px);
            overflow-x: auto;
          }

          .car-identity-title-overlay {
            left: 12px !important;
            right: 12px !important;
          }

          .car-identity-generated-date {
            right: 10px !important;
            bottom: 10px !important;
            max-width: calc(100% - 20px);
          }
        }
      `}</style>
      {/* Nav */}
      <nav className="vehicle-subnav" style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 'var(--app-nav-height, 56px)', background: 'rgba(10,10,9,0.92)', backdropFilter: 'blur(12px)', zIndex: 50 }}>
        <Link href="/app" style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--off-white)', textDecoration: 'none' }}>
          Appreciate<span style={{ color: 'var(--accent)' }}>.</span>Me
        </Link>
        <div className="vehicle-subnav-actions" style={{ display: 'flex', gap: 10 }}>
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
        <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(10,10,9,0.75)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 9px', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.05em', maxWidth: 'calc(100% - 150px)' }}>
          Large photos are automatically optimized before upload.
        </div>
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

        {/* Car identity */}
        <div className="fade-up delay-1" style={{ marginBottom: 36 }}>
          <div className="car-identity-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div className="car-identity-header-copy">
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— CAR IDENTITY</div>
              <div style={{ color: 'var(--gray)', fontSize: 13, lineHeight: 1.5 }}>
                Your vehicle&apos;s visual asset identity, built from its proof, condition, and market data.
              </div>
            </div>
            <div className="car-identity-actions">
              <button
                className="car-identity-action"
                onClick={copyCardSummary}
                style={{ background: cardSummaryCopied ? 'var(--accent)' : 'transparent', border: '1px solid var(--accent)', color: cardSummaryCopied ? 'var(--black)' : 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '8px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}
              >
                {cardSummaryCopied ? 'COPIED!' : 'COPY CARD SUMMARY'}
              </button>
              <Link
                className="car-identity-action"
                href={`/app/community?vehicleId=${encodeURIComponent(vehicle.id)}&intent=share_identity`}
                style={{ background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.45)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '8px 14px', borderRadius: 4, textDecoration: 'none', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                SHARE TO COMMUNITY
              </Link>
              <button
                className="car-identity-action"
                onClick={handleGenerateVisualIdentity}
                disabled={visualIdentityLoading || visualIdentityLimitReached}
                style={{ background: visualIdentityLoading ? 'rgba(0,232,122,0.18)' : 'transparent', border: '1px solid rgba(0,232,122,0.55)', color: visualIdentityLimitReached ? 'var(--gray)' : 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '8px 14px', borderRadius: 4, cursor: visualIdentityLoading ? 'wait' : visualIdentityLimitReached ? 'not-allowed' : 'pointer', letterSpacing: '0.05em', opacity: visualIdentityLoading || visualIdentityLimitReached ? 0.72 : 1 }}
              >
                {visualIdentityLoading
                  ? VISUAL_IDENTITY_LOADING_STEPS[visualIdentityLoadingStep]
                  : visualIdentity
                    ? 'REGENERATE VISUAL IDENTITY'
                    : 'GENERATE VISUAL IDENTITY'}
              </button>
            </div>
          </div>
          <div style={{ color: 'var(--gray)', fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            Creates a stylized digital asset version of your cover photo. This is a visual identity, not proof of vehicle condition.
            <br />
            Visual identity generation uses AI credits. Limit: 3 per vehicle.
          </div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: visualIdentityLimitReached ? '#f5a524' : 'var(--gray)', letterSpacing: '0.08em', marginBottom: 12 }}>
            Visual generations used: {visualIdentityGenerationCount} / {VISUAL_IDENTITY_GENERATION_LIMIT}
          </div>
          {visualIdentityError && (
            <div style={{ color: '#ff8080', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.05em', marginBottom: 12 }}>
              {visualIdentityError}
            </div>
          )}

          <div
            className="car-identity-card"
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #111110 0%, #070807 58%, rgba(0,232,122,0.08) 100%)',
              transform: 'perspective(1100px) translateY(0) rotateX(0deg) rotateY(0deg)',
              transformOrigin: 'center top',
              ...carIdentityGlowStyle(marketConfidence),
            }}
          >
            <div className="car-identity-shine" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))', gap: 0 }}>
              <div className="car-identity-media" style={{ position: 'relative', height: 'clamp(280px, 42vw, 520px)', maxHeight: '60vh', background: '#0e0e0d' }}>
                {showAiIdentityImage ? (
                  <img src={visualIdentityUrl(visualIdentity.imageKey)} alt={`AI visual identity for ${vehicle.year} ${vehicle.make} ${vehicle.model}`} style={{ width: '100%', height: '100%', maxHeight: '60vh', objectFit: 'contain', objectPosition: 'center', display: 'block', background: '#0e0e0d' }} />
                ) : originalIdentityPhotoKey ? (
                  <img src={photoUrl(originalIdentityPhotoKey)} alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} style={{ width: '100%', height: '100%', maxHeight: '60vh', objectFit: 'contain', objectPosition: 'center', display: 'block', background: '#0e0e0d' }} />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.1em' }}>NO PHOTO</div>
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 42%, rgba(0,0,0,0.78) 100%)' }} />
                {visualIdentity && (
                  <div className="car-identity-toggle" style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 4, background: 'rgba(10,10,9,0.72)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: 3 }}>
                    {(['original', 'ai'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setIdentityImageMode(mode)}
                        style={{ background: identityImageMode === mode ? 'var(--accent)' : 'transparent', border: 'none', borderRadius: 999, color: identityImageMode === mode ? 'var(--black)' : 'var(--gray-light)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 8, letterSpacing: '0.08em', padding: '5px 7px' }}
                      >
                        {mode === 'original' ? 'ORIGINAL' : 'AI IDENTITY'}
                      </button>
                    ))}
                  </div>
                )}
                {showAiIdentityImage && (
                  <div style={{ position: 'absolute', top: 14, left: 14, background: 'rgba(0,232,122,0.92)', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '5px 8px', borderRadius: 999 }}>
                    AI VISUAL IDENTITY
                  </div>
                )}
                {showAiIdentityImage && visualIdentity && (
                  <div className="car-identity-generated-date" style={{ position: 'absolute', right: 14, bottom: 14, background: 'rgba(10,10,9,0.72)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.08em', padding: '5px 8px' }}>
                    GENERATED • {new Date(visualIdentity.generatedAt).toLocaleDateString()}
                  </div>
                )}
                <div className="car-identity-title-overlay" style={{ position: 'absolute', left: 16, right: 16, bottom: showAiIdentityImage ? 48 : 16 }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 6 }}>APPRECIATE ME ASSET CARD</div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 34, color: 'var(--off-white)', letterSpacing: '0.04em', lineHeight: 1 }}>
                    {vehicle.year} {vehicle.make.toUpperCase()} {vehicle.model.toUpperCase()}
                  </div>
                </div>
              </div>

              <div style={{ padding: '22px 22px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 18 }}>
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {[
                      { label: 'MARKET CONFIDENCE', value: marketConfidence, tone: marketConfidenceTone(marketConfidence) },
                      { label: 'PROOF STRENGTH', value: `${proofStrength} (${proofFilesCount} ${proofFilesCount === 1 ? 'file' : 'files'})`, tone: marketConfidenceTone(proofStrength) },
                      { label: 'CONDITION', value: conditionReadiness, tone: conditionReadinessTone(conditionReadiness) },
                    ].map(badge => (
                      <div key={badge.label} style={{ border: `1px solid ${badge.tone}`, background: 'rgba(255,255,255,0.025)', borderRadius: 999, padding: '6px 9px' }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--gray)', letterSpacing: '0.1em', marginRight: 6 }}>{badge.label}</span>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: badge.tone, letterSpacing: '0.08em' }}>{badge.value}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.12em', marginBottom: 6 }}>ESTIMATED MARKET VALUE</div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(42px,8vw,64px)', color: medianCompValue == null ? 'var(--gray)' : 'var(--off-white)', lineHeight: 1, letterSpacing: '0.03em', marginBottom: 12 }}>
                    {medianCompValue == null ? 'NO DATA' : formatWholeCurrency(medianCompValue)}
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--gray-light)', letterSpacing: '0.06em', lineHeight: 1.7 }}>
                    {[vehicle.trim, vehicle.color, vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : null].filter(Boolean).join(' / ') || 'Identity details pending'}
                  </div>
                  <div style={{ marginTop: 16, background: 'rgba(0,232,122,0.055)', border: '1px solid rgba(0,232,122,0.18)', borderRadius: 8, padding: '12px 13px' }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.13em', marginBottom: 7 }}>YOUR CAR SPEAKS</div>
                    <div style={{ color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.55 }}>{carSpeaksInsight}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
                  {[
                    { label: 'COMPS', value: String(compCount) },
                    { label: 'SOLD COMPS', value: String(soldCompCount) },
                    { label: 'LOG RECORDS', value: String(vehicle.entries.length) },
                    { label: 'AI TARGET', value: aiValuationRange ? formatWholeCurrency(aiValuationRange.target) : '—' },
                    { label: 'AI RANGE', value: aiValuationRange ? `${formatWholeCurrency(aiValuationRange.low)} – ${formatWholeCurrency(aiValuationRange.high)}` : '—' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '10px 11px' }}>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 5 }}>{stat.label}</div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--off-white)', letterSpacing: '0.04em' }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

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

        {/* Ownership & position */}
        <div className="fade-up delay-3" style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— OWNERSHIP & POSITION</div>
              <div style={{ color: 'var(--gray)', fontSize: 13, lineHeight: 1.5, maxWidth: 680 }}>
                Private owner-side purchase and loan details for understanding your real financial position.
              </div>
            </div>
            <button
              onClick={() => {
                setOwnershipData({
                  purchasePrice: vehicle.ownership?.purchasePrice == null ? '' : String(vehicle.ownership.purchasePrice),
                  purchaseDate: vehicle.ownership?.purchaseDate || '',
                  ownershipStatus: vehicle.ownership?.ownershipStatus || '',
                  loanBalance: vehicle.ownership?.loanBalance == null ? '' : String(vehicle.ownership.loanBalance),
                  monthlyPayment: vehicle.ownership?.monthlyPayment == null ? '' : String(vehicle.ownership.monthlyPayment),
                  interestRate: vehicle.ownership?.interestRate == null ? '' : String(vehicle.ownership.interestRate),
                  lender: vehicle.ownership?.lender || '',
                  notes: vehicle.ownership?.notes || '',
                })
                setEditingOwnership(v => !v)
              }}
              style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '7px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              {editingOwnership ? 'CANCEL' : hasOwnershipData(vehicle.ownership) ? 'EDIT DETAILS' : '+ ADD DETAILS'}
            </button>
          </div>

          {editingOwnership ? (
            <div className="scale-in" style={{ background: 'linear-gradient(180deg, rgba(0,232,122,0.055) 0%, rgba(255,255,255,0.018) 100%)', border: '1px solid rgba(0,232,122,0.18)', borderRadius: 8, padding: '18px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>PURCHASE PRICE ($)</label>
                  <input type="number" value={ownershipData.purchasePrice} onChange={e => setOwnershipData(p => ({ ...p, purchasePrice: e.target.value }))} style={inputStyle} min={0} placeholder="Optional" />
                </div>
                <div>
                  <label style={labelStyle}>PURCHASE DATE</label>
                  <input type="date" value={ownershipData.purchaseDate} onChange={e => setOwnershipData(p => ({ ...p, purchaseDate: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>OWNERSHIP STATUS</label>
                  <select value={ownershipData.ownershipStatus} onChange={e => setOwnershipData(p => ({ ...p, ownershipStatus: e.target.value as VehicleOwnership['ownershipStatus'] }))} style={inputStyle}>
                    <option value="">Skip</option>
                    <option value="owned_outright">Owned Outright</option>
                    <option value="financed">Financed</option>
                    <option value="leased">Leased</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>LOAN BALANCE ($)</label>
                  <input type="number" value={ownershipData.loanBalance} onChange={e => setOwnershipData(p => ({ ...p, loanBalance: e.target.value }))} style={inputStyle} min={0} placeholder="Optional" />
                </div>
                <div>
                  <label style={labelStyle}>MONTHLY PAYMENT ($)</label>
                  <input type="number" value={ownershipData.monthlyPayment} onChange={e => setOwnershipData(p => ({ ...p, monthlyPayment: e.target.value }))} style={inputStyle} min={0} placeholder="Optional" />
                </div>
                <div>
                  <label style={labelStyle}>INTEREST RATE (%)</label>
                  <input type="number" value={ownershipData.interestRate} onChange={e => setOwnershipData(p => ({ ...p, interestRate: e.target.value }))} style={inputStyle} min={0} step="0.01" placeholder="Optional" />
                </div>
                <div>
                  <label style={labelStyle}>LENDER</label>
                  <input value={ownershipData.lender} onChange={e => setOwnershipData(p => ({ ...p, lender: e.target.value }))} style={inputStyle} placeholder="Optional" />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>NOTES</label>
                <textarea value={ownershipData.notes} onChange={e => setOwnershipData(p => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical', minHeight: 76 }} placeholder="Optional" />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={handleSaveOwnership} disabled={saving} style={{ background: 'var(--accent)', color: 'var(--black)', border: 'none', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 600, padding: '9px 18px', borderRadius: 4, cursor: saving ? 'wait' : 'pointer', letterSpacing: '0.05em' }}>
                  {saving ? 'SAVING...' : 'SAVE OWNERSHIP DETAILS'}
                </button>
                <button onClick={resetOwnership} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 16px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>
                  CANCEL
                </button>
              </div>
            </div>
          ) : (
            <div style={{ background: 'linear-gradient(135deg, #111110 0%, #080908 62%, rgba(0,232,122,0.06) 100%)', border: '1px solid rgba(0,232,122,0.16)', borderRadius: 8, padding: '18px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  {
                    label: 'ESTIMATED EQUITY',
                    value: estimatedEquity == null ? '—' : formatSignedCurrency(estimatedEquity),
                    tone: estimatedEquity == null ? 'var(--gray)' : financialTone(estimatedEquity),
                    sub: estimatedMarketValue == null ? 'Market value unknown' : loanBalanceForEquity == null ? 'Add loan balance to calculate' : ownsOutright ? 'Owned outright' : 'Market value minus loan balance',
                  },
                  {
                    label: 'OWNER POSITION',
                    value: ownerPosition == null ? '—' : formatSignedCurrency(ownerPosition),
                    tone: ownerPosition == null ? 'var(--gray)' : financialTone(ownerPosition),
                    sub: !hasPurchasePrice ? 'Add purchase price to calculate owner position.' : estimatedMarketValue == null ? 'Market value unknown' : 'Market value minus purchase price and documented spend',
                  },
                  {
                    label: 'PURCHASE PRICE',
                    value: hasPurchasePrice && ownership ? formatCurrency(ownership.purchasePrice || 0) : '—',
                    tone: hasPurchasePrice ? 'var(--off-white)' : 'var(--gray)',
                    sub: ownership?.purchaseDate ? new Date(`${ownership.purchaseDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Optional',
                  },
                  {
                    label: 'LOAN BALANCE',
                    value: ownsOutright ? '$0' : hasLoanBalance && ownership ? formatCurrency(ownership.loanBalance || 0) : '—',
                    tone: ownsOutright || hasLoanBalance ? 'var(--off-white)' : 'var(--gray)',
                    sub: ownsOutright ? 'Owned outright' : ownership?.ownershipStatus === 'financed' ? 'Financed balance' : 'Optional',
                  },
                ].map(card => (
                  <div key={card.label} style={{ background: 'rgba(255,255,255,0.026)', border: '1px solid rgba(255,255,255,0.075)', borderRadius: 6, padding: '13px 14px' }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 7 }}>{card.label}</div>
                    <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, color: card.tone, lineHeight: 1, letterSpacing: '0.03em' }}>{card.value}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', lineHeight: 1.45, marginTop: 7 }}>{card.sub}</div>
                  </div>
                ))}
              </div>

              {!hasOwnershipData(vehicle.ownership) ? (
                <div style={{ color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.06em', lineHeight: 1.5 }}>
                  Add purchase or loan details to calculate your position.
                </div>
              ) : completedOwnershipFields.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
                    {completedOwnershipFields.map(field => (
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
                  {ownership?.updatedAt && (
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.08em', marginTop: 14 }}>
                      UPDATED {new Date(ownership.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mileage forecast */}
        <div className="fade-up delay-3" style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— VALUE TASKS</div>
              <div style={{ color: 'var(--gray)', fontSize: 13, lineHeight: 1.5, maxWidth: 680 }}>
                Track upcoming work, parts, or proof tasks before they become documented history.
              </div>
            </div>
            <button
              onClick={() => {
                setShowValueTaskForm(v => !v)
                setValueTaskData(emptyValueTaskData)
              }}
              style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '7px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              {showValueTaskForm ? 'CANCEL' : '+ ADD TASK'}
            </button>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #111110 0%, #080908 64%, rgba(0,232,122,0.055) 100%)', border: '1px solid rgba(0,232,122,0.16)', borderRadius: 8, padding: '18px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: showValueTaskForm || sortedValueTasks.length > 0 ? 16 : 0 }}>
              {[
                { label: 'PENDING', value: String(pendingValueTaskCount), tone: pendingValueTaskCount > 0 ? 'var(--accent)' : 'var(--gray)' },
                { label: 'COMPLETED', value: String(completedValueTaskCount), tone: completedValueTaskCount > 0 ? 'var(--off-white)' : 'var(--gray)' },
                { label: 'ESTIMATED QUEUE', value: formatCurrency(valueTasks.reduce((sum, task) => sum + (task.status === 'pending' ? task.estimatedCost || 0 : 0), 0)), tone: 'var(--off-white)' },
              ].map(stat => (
                <div key={stat.label} style={{ background: 'rgba(255,255,255,0.026)', border: '1px solid rgba(255,255,255,0.075)', borderRadius: 6, padding: '12px 13px' }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 6 }}>{stat.label}</div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: stat.tone, lineHeight: 1, letterSpacing: '0.03em' }}>{stat.value}</div>
                </div>
              ))}
            </div>

            {showValueTaskForm && (
              <div className="scale-in" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16, marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 14 }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={labelStyle}>TASK TITLE</label>
                    <input value={valueTaskData.title} onChange={e => setValueTaskData(p => ({ ...p, title: e.target.value }))} style={inputStyle} placeholder="e.g. Replace front tires" />
                  </div>
                  <div>
                    <label style={labelStyle}>CATEGORY</label>
                    <select value={valueTaskData.category} onChange={e => setValueTaskData(p => ({ ...p, category: e.target.value as NonNullable<VehicleValueTask['category']> }))} style={inputStyle}>
                      <option value="maintenance">Maintenance</option>
                      <option value="repair">Repair</option>
                      <option value="cosmetic">Cosmetic</option>
                      <option value="performance">Performance</option>
                      <option value="documentation">Documentation</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>ESTIMATED COST ($)</label>
                    <input type="number" value={valueTaskData.estimatedCost} onChange={e => setValueTaskData(p => ({ ...p, estimatedCost: e.target.value }))} style={inputStyle} min={0} placeholder="Optional" />
                  </div>
                  <div>
                    <label style={labelStyle}>PRIORITY</label>
                    <select value={valueTaskData.priority} onChange={e => setValueTaskData(p => ({ ...p, priority: e.target.value as NonNullable<VehicleValueTask['priority']> }))} style={inputStyle}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>NOTES</label>
                  <textarea value={valueTaskData.notes} onChange={e => setValueTaskData(p => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical', minHeight: 74 }} placeholder="Parts, shops, links, proof needed..." />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={handleAddValueTask} disabled={saving || !valueTaskData.title.trim()} style={{ background: 'var(--accent)', color: 'var(--black)', border: 'none', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 600, padding: '9px 18px', borderRadius: 4, cursor: saving ? 'wait' : 'pointer', letterSpacing: '0.05em', opacity: !valueTaskData.title.trim() ? 0.5 : 1 }}>
                    {saving ? 'SAVING...' : 'SAVE TASK'}
                  </button>
                  <button onClick={() => { setShowValueTaskForm(false); setValueTaskData(emptyValueTaskData) }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 16px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}>
                    CANCEL
                  </button>
                </div>
              </div>
            )}

            {sortedValueTasks.length === 0 ? (
              <div style={{ borderTop: showValueTaskForm ? '1px solid rgba(255,255,255,0.07)' : undefined, paddingTop: showValueTaskForm ? 16 : 0, color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.06em', lineHeight: 1.5 }}>
                NO VALUE TASKS YET.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {sortedValueTasks.map(task => {
                  const priority = task.priority || 'low'
                  const priorityTone = valueTaskPriorityTone(priority)
                  return (
                    <div key={task.id} style={{ background: task.status === 'pending' ? 'rgba(255,255,255,0.026)' : 'rgba(255,255,255,0.015)', border: `1px solid ${task.status === 'pending' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.045)'}`, borderRadius: 6, padding: '13px 14px', opacity: task.status === 'completed' ? 0.76 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
                            <div style={{ color: 'var(--off-white)', fontWeight: 600, fontSize: 14 }}>{task.title}</div>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, letterSpacing: '0.1em', color: task.status === 'completed' ? 'var(--gray)' : 'var(--accent)', border: `1px solid ${task.status === 'completed' ? 'rgba(255,255,255,0.12)' : 'rgba(0,232,122,0.28)'}`, borderRadius: 999, padding: '3px 7px' }}>
                              {task.status.toUpperCase()}
                            </span>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, letterSpacing: '0.1em', color: priorityTone, background: valueTaskPriorityBg(priority), border: `1px solid ${priorityTone}`, borderRadius: 999, padding: '3px 7px' }}>
                              {priority.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontFamily: 'DM Mono, monospace', fontSize: 11, marginBottom: 7 }}>
                            <span style={{ color: 'var(--gray-light)' }}>Category: {valueTaskCategoryLabel(task.category)}</span>
                            <span style={{ color: task.estimatedCost ? 'var(--off-white)' : 'var(--gray)' }}>Est. Cost: {task.estimatedCost == null ? '—' : formatCurrency(task.estimatedCost)}</span>
                            <span style={{ color: 'var(--gray)' }}>Created: {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            {task.completedAt && <span style={{ color: 'var(--gray)' }}>Completed: {new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                          </div>
                          <div style={{ color: 'var(--gray)', fontSize: 13, lineHeight: 1.5 }}>Notes: {task.notes || '—'}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {task.status === 'pending' && (
                            <button onClick={() => handleCompleteValueTask(task)} disabled={saving} style={{ background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.32)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '5px 9px', borderRadius: 3, cursor: saving ? 'wait' : 'pointer', letterSpacing: '0.06em' }}>
                              COMPLETE
                            </button>
                          )}
                          <button onClick={() => handleDeleteValueTask(task.id)} disabled={saving} style={{ background: 'transparent', border: '1px solid rgba(255,80,80,0.2)', color: '#ff8080', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '5px 9px', borderRadius: 3, cursor: saving ? 'wait' : 'pointer' }}>
                            DELETE
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Mileage forecast */}
        <div className="fade-up delay-3" style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— MILEAGE FORECAST</div>
              <div style={{ color: 'var(--gray)', fontSize: 13, lineHeight: 1.5, maxWidth: 680 }}>
                Mileage Forecast estimates your current mileage from your driving habits. Review before applying because mileage affects valuation, comps, and buyer trust.
              </div>
            </div>
            {mileageForecast && !editingMileageForecast && (
              <button
                onClick={editMileageForecast}
                style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '7px 14px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}
              >
                EDIT FORECAST
              </button>
            )}
          </div>

          {(!mileageForecast || editingMileageForecast) ? (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>BASELINE MILEAGE</label>
                  <input
                    type="number"
                    value={mileageForecastData.baselineMileage}
                    onChange={e => setMileageForecastData(p => ({ ...p, baselineMileage: e.target.value }))}
                    style={inputStyle}
                    min={0}
                    placeholder="Current mileage"
                  />
                </div>
                <div>
                  <label style={labelStyle}>BASELINE DATE</label>
                  <input
                    type="date"
                    value={mileageForecastData.baselineDate}
                    onChange={e => setMileageForecastData(p => ({ ...p, baselineDate: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>AVERAGE WEEKLY MILES</label>
                  <input
                    type="number"
                    value={mileageForecastData.averageWeeklyMiles}
                    onChange={e => setMileageForecastData(p => ({ ...p, averageWeeklyMiles: e.target.value }))}
                    style={inputStyle}
                    min={0}
                    placeholder="e.g. 175"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={handleSaveMileageForecast}
                  disabled={saving}
                  style={{ background: 'var(--accent)', border: 'none', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 600, padding: '9px 16px', borderRadius: 4, cursor: saving ? 'wait' : 'pointer', letterSpacing: '0.05em' }}
                >
                  {saving ? 'SAVING...' : 'SAVE FORECAST SETTINGS'}
                </button>
                {mileageForecast && (
                  <button
                    onClick={() => setEditingMileageForecast(false)}
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, padding: '9px 16px', borderRadius: 4, cursor: 'pointer', letterSpacing: '0.05em' }}
                  >
                    CANCEL
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: 'linear-gradient(180deg, rgba(0,232,122,0.06) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(0,232,122,0.18)', borderRadius: 8, padding: '18px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'CURRENT SAVED MILEAGE', value: `${vehicle.mileage.toLocaleString()} mi` },
                  { label: 'BASELINE MILEAGE', value: `${mileageForecast.baselineMileage.toLocaleString()} mi` },
                  { label: 'AVG WEEKLY MILES', value: `${(mileageForecast.averageWeeklyMiles || 0).toLocaleString()} mi` },
                  { label: 'ESTIMATED TODAY', value: suggestedMileage == null ? '—' : `${suggestedMileage.toLocaleString()} mi`, accent: true },
                  { label: 'LAST CALCULATED', value: mileageForecastLastCalculated },
                ].map(item => (
                  <div key={item.label} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '12px 13px' }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: item.accent ? 15 : 12, color: item.accent ? 'var(--accent)' : 'var(--off-white)', letterSpacing: '0.04em' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ color: 'var(--gray)', fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>
                Based on {mileageForecastWeeks.toFixed(1)} weeks since {mileageForecast.baselineDate}. Mileage is never updated until you approve it.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, alignItems: 'end' }}>
                <div>
                  <label style={labelStyle}>ADJUST BEFORE APPROVING</label>
                  <input
                    type="number"
                    value={mileageForecastData.suggestedMileage}
                    onChange={e => setMileageForecastData(p => ({ ...p, suggestedMileage: e.target.value }))}
                    style={inputStyle}
                    min={0}
                  />
                </div>
                <button
                  onClick={() => suggestedMileage != null && handleApproveMileageUpdate(suggestedMileage)}
                  disabled={saving || suggestedMileage == null}
                  style={{ background: 'var(--accent)', border: 'none', color: 'var(--black)', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 600, padding: '10px 16px', borderRadius: 4, cursor: saving ? 'wait' : 'pointer', letterSpacing: '0.05em', minHeight: 40 }}
                >
                  {saving ? 'UPDATING...' : 'APPROVE UPDATE'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* AI vehicle evaluation */}
        <div className="fade-up delay-3" style={{ marginBottom: 36 }}>
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
              {vehicle.aiEvaluation.valuationRange && (
                <div style={{ background: 'linear-gradient(180deg, rgba(0,232,122,0.08) 0%, rgba(0,232,122,0.02) 100%)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 6, padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.12em', marginBottom: 6 }}>
                    AI ESTIMATED RANGE
                  </div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(30px,5vw,42px)', color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.03em', marginBottom: 6 }}>
                    {formatCurrency(vehicle.aiEvaluation.valuationRange.low)} - {formatCurrency(vehicle.aiEvaluation.valuationRange.high)}
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: 8 }}>
                    TARGET: {formatCurrency(vehicle.aiEvaluation.valuationRange.target)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.55 }}>
                    {vehicle.aiEvaluation.valuationRange.reasoning}
                  </div>
                </div>
              )}
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
            <label style={labelStyle}>BOOK VALUE (OPTIONAL)</label>
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

        {/* Proof strength */}
        <div className="fade-up delay-4" style={{ marginBottom: 36 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— PROOF STRENGTH</div>
            <div style={{ color: 'var(--gray)', fontSize: 13, lineHeight: 1.5 }}>
              Proof Strength measures how well this vehicle&apos;s history, condition, market value, and ownership story are documented.
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #111110 0%, #080908 64%, rgba(0,232,122,0.055) 100%)', border: '1px solid rgba(0,232,122,0.16)', borderRadius: 8, padding: '18px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px,100%),1fr))', gap: 18, alignItems: 'stretch', marginBottom: 16 }}>
              <div style={{ background: 'rgba(255,255,255,0.026)', border: `1px solid ${proofDocumentationTone}66`, borderRadius: 6, padding: '16px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.12em', marginBottom: 8 }}>DOCUMENTATION SCORE</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 50, color: proofDocumentationTone, lineHeight: 1, letterSpacing: '0.03em' }}>{proofDocumentationScore}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--gray)', letterSpacing: '0.06em' }}>/ 100</span>
                </div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: proofDocumentationTone, letterSpacing: '0.08em', lineHeight: 1.4 }}>
                  {proofDocumentationLabel}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 9 }}>
                {proofScoreChecks.map(check => (
                  <div key={check.key} style={{ background: 'rgba(255,255,255,0.022)', border: `1px solid ${check.complete ? 'rgba(0,232,122,0.22)' : 'rgba(255,77,79,0.16)'}`, borderRadius: 6, padding: '10px 11px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ color: check.complete ? 'var(--accent)' : '#ff8080', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                        {check.complete ? '✓' : '×'}
                      </span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: check.complete ? 'var(--accent)' : 'var(--gray-light)', letterSpacing: '0.1em' }}>
                        {check.label.toUpperCase()}
                      </span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono, monospace', fontSize: 9, color: check.complete ? 'var(--accent)' : 'var(--gray)' }}>
                        {check.complete ? `+${check.points}` : '+0'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--gray)', fontSize: 12, lineHeight: 1.45 }}>
                      {check.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {proofNextSteps.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14 }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.12em', marginBottom: 9 }}>NEXT STEPS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {proofNextSteps.map(step => (
                    <div key={step} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.04em', padding: '6px 9px' }}>
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Vehicle timeline */}
        <div className="fade-up delay-4" style={{ marginBottom: 36 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— VEHICLE TIMELINE</div>
            <div style={{ color: 'var(--gray)', fontSize: 13, lineHeight: 1.5 }}>
              A chronological view of this vehicle&apos;s ownership, records, tasks, condition, and market history.
            </div>
          </div>

          {timelineEvents.length === 0 ? (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '22px 18px', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.06em', lineHeight: 1.5 }}>
              No timeline events yet. Add logs, comps, or ownership details to build this vehicle&apos;s history.
            </div>
          ) : (
            <div style={{ background: 'linear-gradient(135deg, #111110 0%, #080908 64%, rgba(0,232,122,0.045) 100%)', border: '1px solid rgba(0,232,122,0.14)', borderRadius: 8, padding: '16px 18px' }}>
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: 'linear-gradient(180deg, rgba(0,232,122,0.8), rgba(0,232,122,0.08))' }} />
                {timelineEvents.map(event => {
                  const tone = timelineTypeTone(event.type)
                  return (
                    <div key={event.id} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', gap: 12 }}>
                      <div style={{ position: 'relative', zIndex: 1, width: 15, height: 15, borderRadius: 999, border: `1px solid ${tone}`, background: '#0a0a09', boxShadow: `0 0 18px ${tone}33`, marginTop: 3 }} />
                      <div style={{ background: 'rgba(255,255,255,0.024)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '12px 13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 7 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, letterSpacing: '0.1em', color: tone, border: `1px solid ${tone}88`, background: `${tone}12`, borderRadius: 999, padding: '3px 7px' }}>
                              {event.type}
                            </span>
                            {'soldOrAsking' in event && (
                              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, letterSpacing: '0.1em', color: event.soldOrAsking === 'sold' ? 'var(--accent)' : 'var(--gray-light)', border: `1px solid ${event.soldOrAsking === 'sold' ? 'rgba(0,232,122,0.32)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 999, padding: '3px 7px' }}>
                                {event.soldOrAsking.toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.06em' }}>
                            {new Date(event.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: 'var(--off-white)', fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{event.title}</div>
                            <div style={{ color: 'var(--gray)', fontSize: 12, lineHeight: 1.45 }}>{event.detail}</div>
                          </div>
                          {event.amount && (
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--off-white)', letterSpacing: '0.04em', flexShrink: 0 }}>
                              {event.amount}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Proof vault */}
        <div className="fade-up delay-4" style={{ marginBottom: 36 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>— PROOF VAULT</div>
            <div style={{ color: 'var(--gray)', fontSize: 13, lineHeight: 1.5 }}>
              Your Proof Vault stores receipts, photos, and documents that support this vehicle&apos;s history and value.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'TOTAL PROOF FILES', value: String(proofFilesCount) },
              { label: 'PROOF COVERAGE', value: `${proofCoverage}%` },
              { label: 'RECORDS WITH PROOF', value: String(recordsWithProof) },
              { label: 'RECORDS MISSING PROOF', value: String(recordsMissingProof) },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, color: 'var(--off-white)', lineHeight: 1 }}>{stat.value}</div>
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

          {entriesWithProof.length === 0 ? (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '22px 18px', textAlign: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.08em' }}>
              NO PROOF FILES ADDED YET
            </div>
          ) : (
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
                          <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: 'var(--gray)', letterSpacing: 0, marginTop: 4 }}>
                            Large photos are automatically optimized before upload.
                          </div>
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
