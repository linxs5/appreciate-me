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

export interface MarketComp {
  id: string
  source: string
  url?: string
  price: number
  mileage?: number
  soldOrAsking: 'sold' | 'asking'
  notes?: string
  dateAdded: string
}

export interface ConditionCheckup {
  exterior?: 'excellent' | 'good' | 'fair' | 'poor' | ''
  interior?: 'excellent' | 'good' | 'fair' | 'poor' | ''
  mechanical?: 'excellent' | 'good' | 'fair' | 'poor' | ''
  titleStatus?: 'clean' | 'rebuilt' | 'salvage' | 'unknown' | ''
  rust?: 'none' | 'minor' | 'moderate' | 'severe' | 'unknown' | ''
  leaks?: 'none' | 'minor' | 'major' | 'unknown' | ''
  warningLights?: 'none' | 'check_engine' | 'multiple' | 'unknown' | ''
  tires?: 'new' | 'good' | 'worn' | 'needs_replacement' | 'unknown' | ''
  brakes?: 'new' | 'good' | 'worn' | 'needs_service' | 'unknown' | ''
  acHeat?: 'works' | 'partial' | 'not_working' | 'unknown' | ''
  transmission?: 'smooth' | 'minor_issues' | 'major_issues' | 'unknown' | ''
  frameCondition?: 'excellent' | 'good' | 'fair' | 'rusty' | 'unknown' | ''
  paintCondition?: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' | ''
  interiorWear?: 'minimal' | 'normal' | 'heavy' | 'unknown' | ''
  accidentHistory?: 'none_known' | 'minor' | 'major' | 'unknown' | ''
  oemPartsKept?: boolean
  knownIssues?: string
  recentService?: string
  modifications?: string
  notes?: string
  updatedAt?: string
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
  conditionCheckup?: ConditionCheckup
  shareConditionCheckup?: boolean
  bookValue?: number
  aiEvaluation?: {
    generatedAt: string
    overallSummary: string
    marketPosition: string
    conditionSummary: string
    proofStrength: string
    risks: string[]
    recommendedNextSteps: string[]
  }
  photoKeys: string[]
  coverPhotoKey?: string
  entries: LogEntry[]
  marketComps?: MarketComp[]
  createdAt: string
  userId?: string
  ownerUsername?: string
  ownershipHistory?: { date: string; fromUserId?: string; toEmail?: string }[]
}
