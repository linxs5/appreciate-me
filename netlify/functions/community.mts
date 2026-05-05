import { getStore } from '@netlify/blobs'

const SESSION_COOKIE = 'am_session'

type UserProfile = {
  id: string
  email: string
  username: string
  displayName?: string
  createdAt: string
  updatedAt?: string
}

type CommunityPostType = 'build_update' | 'question' | 'valuation_check' | 'showcase' | 'proof_drop'
type CommunityPostVisibility = 'public' | 'members'

const postTypes = new Set<CommunityPostType>([
  'build_update',
  'question',
  'valuation_check',
  'showcase',
  'proof_drop',
])
const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

function parseCookie(req: Request, name: string) {
  const cookie = req.headers.get('cookie') || ''
  const match = cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ''
}

async function getProfile(userId: string): Promise<UserProfile | null> {
  const profileStore = getStore('user-profiles')
  return profileStore.get(userId, { type: 'json' }) as Promise<UserProfile | null>
}

async function requireUser(req: Request): Promise<UserProfile | null> {
  const sessionId = parseCookie(req, SESSION_COOKIE)
  if (!sessionId) return null
  const sessionStore = getStore('auth-sessions')
  const session: any = await sessionStore.get(sessionId, { type: 'json' })
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    await sessionStore.delete(sessionId).catch(() => {})
    return null
  }
  return getProfile(session.userId)
}

const optionalUser = requireUser

function authError(message = 'Unauthorized') {
  return new Response(message, { status: 401 })
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function optionalFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function median(values: number[]) {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2
  return sorted[middle]
}

function conditionReadiness(conditionCheckup: any): 'STRONG' | 'MODERATE' | 'NEEDS ATTENTION' | undefined {
  if (!conditionCheckup || typeof conditionCheckup !== 'object') return undefined
  let strong = 0
  let caution = 0
  let needsAttention = 0
  Object.entries(conditionCheckup).forEach(([key, value]) => {
    if (['updatedAt', 'knownIssues', 'recentService', 'modifications', 'notes'].includes(key)) return
    if (value === true || value === 'excellent' || value === 'good' || value === 'none' || value === 'new' || value === 'smooth' || value === 'clean') strong += 1
    if (value === 'fair' || value === 'minor' || value === 'normal' || value === 'partial' || value === 'unknown' || value === 'minor_issues') caution += 1
    if (value === false || value === 'poor' || value === 'severe' || value === 'major' || value === 'heavy' || value === 'not_working' || value === 'major_issues' || value === 'salvage' || value === 'rebuilt' || value === 'needs_replacement' || value === 'needs_service') needsAttention += 1
  })
  if (needsAttention > 0) return 'NEEDS ATTENTION'
  if (caution > 2 || strong === 0) return 'MODERATE'
  return 'STRONG'
}

function vehicleSnapshot(vehicle: any) {
  const marketComps = Array.isArray(vehicle.marketComps) ? vehicle.marketComps : []
  const soldPrices = marketComps
    .filter((comp: any) => comp?.soldOrAsking === 'sold')
    .map((comp: any) => comp.price)
    .filter((price: unknown): price is number => typeof price === 'number' && Number.isFinite(price))
  const allPrices = marketComps
    .map((comp: any) => comp?.price)
    .filter((price: unknown): price is number => typeof price === 'number' && Number.isFinite(price))
  const soldCompCount = marketComps.filter((comp: any) => comp?.soldOrAsking === 'sold').length
  const proofFiles = (Array.isArray(vehicle.entries) ? vehicle.entries : []).reduce(
    (sum: number, entry: any) => sum + (Array.isArray(entry.attachments) ? entry.attachments.length : 0),
    0
  )
  return {
    year: optionalFiniteNumber(vehicle.year),
    make: cleanString(vehicle.make, 80) || undefined,
    model: cleanString(vehicle.model, 80) || undefined,
    trim: cleanString(vehicle.trim, 80) || undefined,
    mileage: optionalFiniteNumber(vehicle.mileage),
    coverPhotoKey: cleanString(vehicle.coverPhotoKey || vehicle.photoKeys?.[0], 240) || undefined,
    estimatedValue: median(soldPrices.length > 0 ? soldPrices : allPrices),
    marketConfidence: soldCompCount >= 5 ? 'HIGH' : soldCompCount >= 2 ? 'MEDIUM' : marketComps.length > 0 ? 'LOW' : undefined,
    proofFiles,
    conditionReadiness: conditionReadiness(vehicle.conditionCheckup),
  }
}

function postVisibility(post: any): CommunityPostVisibility {
  return post?.visibility === 'public' ? 'public' : 'members'
}

function canViewPost(post: any, user: UserProfile | null) {
  return postVisibility(post) === 'public' || Boolean(user)
}

function publicPost(post: any, user: UserProfile | null) {
  const normalized = {
    ...post,
    visibility: postVisibility(post),
  }
  if (user) return normalized

  const {
    ownerId: _ownerId,
    appreciateUserIds: _appreciateUserIds,
    ...safePost
  } = normalized
  return {
    ...safePost,
    appreciateUserIds: [],
  }
}

export default async (req: Request) => {
  const postStore = getStore('community-posts')

  if (req.method === 'GET') {
    const user = await optionalUser(req)
    const url = new URL(req.url)
    const vehicleId = cleanString(url.searchParams.get('vehicleId'), 120)
    const { blobs } = await postStore.list()
    const posts = (await Promise.all(blobs.map(blob => postStore.get(blob.key, { type: 'json' }))))
      .filter(Boolean)
      .filter(post => canViewPost(post, user))
      .filter((post: any) => !vehicleId || post.vehicleId === vehicleId || post.buildVehicleId === vehicleId)
      .map(post => publicPost(post, user))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return Response.json({ posts }, { headers: noStoreHeaders })
  }

  if (req.method === 'POST') {
    const user = await requireUser(req)
    if (!user) return authError()
    const body = await req.json().catch(() => ({}))
    const title = cleanString(body.title, 120)
    const postBody = cleanString(body.body, 5000)
    const type = postTypes.has(body.type) ? body.type : 'build_update'
    const visibility: CommunityPostVisibility = body.visibility === 'public' ? 'public' : 'members'
    if (!title || !postBody) return new Response('Missing title or body', { status: 400 })

    let vehicle: any = null
    const vehicleId = cleanString(body.vehicleId, 120)
    if (vehicleId) {
      const vehicleStore = getStore('vehicles')
      const existing: any = await vehicleStore.get(vehicleId, { type: 'json' })
      if (!existing) return new Response('Vehicle not found', { status: 404 })
      if (existing.ownerId !== user.id) return new Response('Forbidden', { status: 403 })
      vehicle = existing
    }

    const snapshot = vehicle ? vehicleSnapshot(vehicle) : undefined
    const createdAt = new Date().toISOString()
    const post = {
      id: crypto.randomUUID(),
      ownerId: user.id,
      ownerUsername: user.username,
      ownerDisplayName: user.displayName,
      title,
      body: postBody,
      type,
      visibility,
      vehicleId: vehicle?.id,
      buildVehicleId: vehicle?.id,
      buildPhotoKeys: [],
      vehicleSnapshot: snapshot,
      tags: Array.isArray(body.tags) ? body.tags.map((tag: unknown) => cleanString(tag, 32)).filter(Boolean).slice(0, 8) : [],
      make: snapshot?.make,
      model: snapshot?.model,
      year: snapshot?.year,
      appreciateUserIds: [],
      appreciateCount: 0,
      commentCount: 0,
      createdAt,
    }

    await postStore.setJSON(post.id, post)
    return Response.json({ post }, { status: 201, headers: noStoreHeaders })
  }

  return new Response('Method not allowed', { status: 405 })
}
