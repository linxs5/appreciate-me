import type { Vehicle, LogEntry } from './types'

const BASE = '/.netlify/functions'

export async function getVehicles(): Promise<Vehicle[]> {
  const res = await fetch(`${BASE}/vehicles`)
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

export function photoUrl(key: string): string {
  return `/.netlify/functions/get-photo?key=${encodeURIComponent(key)}`
}

export function totalInvested(entries: LogEntry[]): number {
  return entries.reduce((s, e) => s + (e.cost || 0), 0)
}
