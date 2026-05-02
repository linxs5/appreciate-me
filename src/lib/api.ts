import type { Vehicle, LogEntry, Attachment } from './types'

const BASE = '/.netlify/functions'

export type ErrorReport = {
  id?: string
  message: string
  stack?: string
  page?: string
  userAgent?: string
  extra?: unknown
  createdAt: string
}

export async function getVehicles(): Promise<Vehicle[]> {
  const res = await fetch(`${BASE}/vehicles`)
  if (!res.ok) return []
  return res.json()
}

export async function getLegacyVehicles(): Promise<Vehicle[]> {
  const res = await fetch(`${BASE}/vehicles?scope=legacy`)
  if (!res.ok) return []
  return res.json()
}

export async function createVehicle(data: Omit<Vehicle, 'id' | 'entries' | 'photoKeys' | 'createdAt'>): Promise<Vehicle> {
  const res = await fetch(`${BASE}/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create vehicle')
  return res.json()
}

export async function deleteVehicle(id: string): Promise<void> {
  await fetch(`${BASE}/vehicles?id=${id}`, { method: 'DELETE' })
}

export async function claimLegacyVehicle(id: string): Promise<Vehicle> {
  const res = await fetch(`${BASE}/vehicle?id=${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'claim-legacy-vehicle' }),
  })
  if (!res.ok) throw new Error('Failed to claim vehicle')
  return res.json()
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const res = await fetch(`${BASE}/vehicle?id=${id}`)
  if (!res.ok) return null
  return res.json()
}

export async function getPublicVehicle(id: string): Promise<Vehicle | null> {
  const res = await fetch(`${BASE}/get-vehicle-public?id=${id}`)
  if (!res.ok) return null
  return res.json()
}

export async function updateVehicle(id: string, data: Partial<Vehicle>): Promise<Vehicle> {
  const res = await fetch(`${BASE}/vehicle?id=${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update-vehicle', ...data }),
  })
  if (!res.ok) throw new Error('Failed to update vehicle')
  return res.json()
}

export async function reportError(payload: ErrorReport): Promise<void> {
  const res = await fetch(`${BASE}/report-error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to report error')
}

export async function getErrorReports(): Promise<ErrorReport[]> {
  const res = await fetch(`${BASE}/report-error`)
  if (!res.ok) return []
  return res.json()
}

export async function generateAiEvaluation(vehicle: Vehicle): Promise<Vehicle['aiEvaluation']> {
  const res = await fetch(`${BASE}/generate-ai-evaluation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle }),
  })
  if (!res.ok) {
    const message = await res.text().catch(() => '')
    throw new Error(message || 'Failed to generate AI evaluation')
  }
  return res.json()
}

export async function generateVisualIdentity(vehicle: Vehicle): Promise<Vehicle['visualIdentity']> {
  const res = await fetch(`${BASE}/generate-visual-identity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle }),
  })
  if (!res.ok) {
    const message = await res.text().catch(() => '')
    throw new Error(message || 'Failed to generate visual identity')
  }
  return res.json()
}

export async function setCoverPhoto(vehicleId: string, coverPhotoKey: string): Promise<Vehicle> {
  return updateVehicle(vehicleId, { coverPhotoKey })
}

export async function addEntry(vehicleId: string, entry: Omit<LogEntry, 'id'>): Promise<Vehicle> {
  const res = await fetch(`${BASE}/vehicle?id=${vehicleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add-entry', entry }),
  })
  if (!res.ok) throw new Error('Failed to add entry')
  return res.json()
}

export async function updateEntry(vehicleId: string, entryId: string, entry: Partial<LogEntry>): Promise<Vehicle> {
  const res = await fetch(`${BASE}/vehicle?id=${vehicleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update-entry', entryId, entry }),
  })
  if (!res.ok) throw new Error('Failed to update entry')
  return res.json()
}

export async function deleteEntry(vehicleId: string, entryId: string): Promise<Vehicle> {
  const res = await fetch(`${BASE}/vehicle?id=${vehicleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete-entry', entryId }),
  })
  if (!res.ok) throw new Error('Failed to delete entry')
  return res.json()
}

export async function uploadPhoto(vehicleId: string, file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('vehicleId', vehicleId)
  const res = await fetch(`${BASE}/upload-photo`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error('Failed to upload photo')
  const data = await res.json()
  return data.key
}

export async function uploadEntryAttachment(
  vehicleId: string,
  entryId: string,
  file: File
): Promise<Attachment> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('vehicleId', vehicleId)
  formData.append('entryId', entryId)
  const res = await fetch(`${BASE}/upload-entry-attachment`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error('Failed to upload attachment')
  const data = await res.json()
  return data.attachment
}

export function photoUrl(key: string): string {
  return `/.netlify/functions/get-photo?key=${encodeURIComponent(key)}`
}

export function visualIdentityUrl(key: string): string {
  return `${BASE}/generate-visual-identity?key=${encodeURIComponent(key)}`
}

export function attachmentUrl(key: string): string {
  return `/.netlify/functions/get-entry-attachment?key=${encodeURIComponent(key)}`
}

export function totalInvested(entries: LogEntry[]): number {
  return entries.reduce((s, e) => s + (e.cost || 0), 0)
}
