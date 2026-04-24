export interface Attachment {
  key: string
  name: string
  type: string
  size: number
  uploadedAt: string
}

export interface LogEntry {
  id: string
  type: 'mod' | 'maintenance' | 'repair'
  title: string
  cost: number
  estimatedValueImpact?: number
  date: string
  description?: string
  photoKeys?: string[]
  attachments?: Attachment[]
}

export interface Vehicle {
  id: string
  year: number
  make: string
  model: string
  trim?: string
  color?: string
  mileage: number
  vin?: string
  photoKeys: string[]
  coverPhotoKey?: string
  entries: LogEntry[]
  createdAt: string
  userId?: string
  ownerUsername?: string
  ownershipHistory?: { date: string; fromUserId?: string; toEmail?: string }[]
}
