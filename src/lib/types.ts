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

export type CommunityPostType =
  | "build_update"
  | "question"
  | "valuation_check"
  | "showcase"
  | "proof_drop"

export type CommunityPostVisibility = "public" | "members"

export type CommunityPost = {
  id: string
  ownerId: string
  ownerUsername?: string
  ownerDisplayName?: string
  title: string
  body: string
  type: CommunityPostType
  visibility?: CommunityPostVisibility
  vehicleId?: string
  buildVehicleId?: string
  buildPhotoKeys?: string[]
  vehicleSnapshot?: {
    year?: number
    make?: string
    model?: string
    trim?: string
    mileage?: number
    coverPhotoKey?: string
    estimatedValue?: number
    marketConfidence?: "LOW" | "MEDIUM" | "HIGH"
    proofFiles?: number
    conditionReadiness?: "STRONG" | "MODERATE" | "NEEDS ATTENTION"
  }
  tags?: string[]
  make?: string
  model?: string
  year?: number
  appreciateUserIds: string[]
  appreciateCount: number
  commentCount: number
  createdAt: string
  updatedAt?: string
}

export type CommunityComment = {
  id: string
  postId: string
  parentId?: string
  ownerId: string
  ownerUsername?: string
  ownerDisplayName?: string
  body: string
  appreciateUserIds: string[]
  appreciateCount: number
  createdAt: string
  updatedAt?: string
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

export interface VehicleOwnership {
  purchasePrice?: number
  purchaseDate?: string
  ownershipStatus?: "owned_outright" | "financed" | "leased" | "other" | ""
  loanBalance?: number
  monthlyPayment?: number
  interestRate?: number
  lender?: string
  notes?: string
  updatedAt?: string
}

export interface VehicleValueTask {
  id: string
  title: string
  category?: "maintenance" | "repair" | "cosmetic" | "performance" | "documentation" | "other"
  estimatedCost?: number
  priority?: "low" | "medium" | "high"
  notes?: string
  status: "pending" | "completed"
  createdAt: string
  completedAt?: string
}

export interface UserProfile {
  id: string
  email: string
  username: string
  displayName?: string
  createdAt: string
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
  ownership?: VehicleOwnership
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
    valuationRange?: {
      low: number
      target: number
      high: number
      reasoning: string
    }
  }
  visualIdentity?: {
    imageKey: string
    generatedAt: string
    sourcePhotoKey?: string
    referencePhotoKeys?: string[]
    prompt?: string
    generationCount?: number
    assetKind?: 'single_visual_identity'
    futureSpinSet?: {
      status: 'not_generated'
      requiredAngles: string[]
    }
  }
  mileageForecast?: {
    baselineMileage: number
    baselineDate: string
    averageWeeklyMiles?: number
    lastSuggestedMileage?: number
    lastSuggestedAt?: string
  }
  photoKeys: string[]
  coverPhotoKey?: string
  entries: LogEntry[]
  valueTasks?: VehicleValueTask[]
  marketComps?: MarketComp[]
  createdAt: string
  ownerId?: string
  userId?: string
  ownerUsername?: string
  ownershipHistory?: { date: string; fromUserId?: string; toEmail?: string }[]
}
