import { getStore } from '@netlify/blobs'

const SESSION_COOKIE = 'am_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type UserProfile = {
  id: string
  email: string
  username: string
  displayName?: string
  createdAt: string
  updatedAt?: string
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function cleanUsername(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)
}

function defaultUsername(email: string) {
  return cleanUsername(email.split('@')[0]) || `user${Date.now()}`
}

function parseCookie(req: Request, name: string) {
  const cookie = req.headers.get('cookie') || ''
  const match = cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ''
}

function sessionCookie(req: Request, sessionId: string, maxAge = SESSION_MAX_AGE_SECONDS) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

function clearSessionCookie(req: Request) {
  return sessionCookie(req, '', 0)
}

async function hashPassword(password: string, salt = crypto.randomUUID()) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 120000,
      hash: 'SHA-256',
    },
    key,
    256
  )
  const hash = Buffer.from(bits).toString('base64')
  return { salt, hash }
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

async function usernameAvailable(username: string, currentUserId?: string) {
  const profileStore = getStore('user-profiles')
  const { blobs } = await profileStore.list()
  const profiles = await Promise.all(blobs.map(blob => profileStore.get(blob.key, { type: 'json' })))
  return !profiles.some((profile: any) => profile?.username === username && profile?.id !== currentUserId)
}

async function uniqueUsername(base: string) {
  let username = base
  let suffix = 2
  while (!(await usernameAvailable(username))) {
    username = `${base.slice(0, 20)}${suffix}`
    suffix += 1
  }
  return username
}

async function createSession(req: Request, userId: string) {
  const sessionStore = getStore('auth-sessions')
  const sessionId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString()
  await sessionStore.setJSON(sessionId, { userId, createdAt: new Date().toISOString(), expiresAt })
  return sessionCookie(req, sessionId)
}

function authError(message = 'Unauthorized') {
  return new Response(message, { status: 401 })
}

export default async (req: Request) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const usersStore = getStore('auth-users')
  const profileStore = getStore('user-profiles')
  const sessionStore = getStore('auth-sessions')

  if (action === 'me') {
    const user = await requireUser(req)
    if (!user) return authError()
    return Response.json({ user })
  }

  if (action === 'logout' && req.method === 'POST') {
    const sessionId = parseCookie(req, SESSION_COOKIE)
    if (sessionId) await sessionStore.delete(sessionId).catch(() => {})
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie(req) } })
  }

  if ((action === 'signup' || action === 'login') && req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    const email = normalizeEmail(body.email)
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email.includes('@') || password.length < 8) {
      return new Response('Use a valid email and an 8+ character password.', { status: 400 })
    }

    const userKey = encodeURIComponent(email)
    const existingUser: any = await usersStore.get(userKey, { type: 'json' })

    if (action === 'signup') {
      if (existingUser) return new Response('An account already exists for that email.', { status: 409 })
      const id = crypto.randomUUID()
      const passwordHash = await hashPassword(password)
      const createdAt = new Date().toISOString()
      const username = await uniqueUsername(defaultUsername(email))
      const profile: UserProfile = { id, email, username, createdAt }
      await usersStore.setJSON(userKey, { id, email, ...passwordHash, createdAt })
      await profileStore.setJSON(id, profile)
      const cookie = await createSession(req, id)
      return Response.json({ user: profile }, { status: 201, headers: { 'Set-Cookie': cookie } })
    }

    if (!existingUser) return authError('Invalid email or password.')
    const passwordHash = await hashPassword(password, existingUser.salt)
    if (passwordHash.hash !== existingUser.hash) return authError('Invalid email or password.')
    const profile = await getProfile(existingUser.id)
    if (!profile) return new Response('Profile not found.', { status: 500 })
    const cookie = await createSession(req, existingUser.id)
    return Response.json({ user: profile }, { headers: { 'Set-Cookie': cookie } })
  }

  if (action === 'profile' && req.method === 'PUT') {
    const user = await requireUser(req)
    if (!user) return authError()
    const body = await req.json().catch(() => ({}))
    const username = cleanUsername(body.username)
    if (username.length < 3) return new Response('Username must be at least 3 characters.', { status: 400 })
    if (!(await usernameAvailable(username, user.id))) {
      return new Response('Username is already taken.', { status: 409 })
    }
    const displayName = typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim().slice(0, 80)
      : undefined
    const updated: UserProfile = {
      ...user,
      username,
      displayName,
      updatedAt: new Date().toISOString(),
    }
    await profileStore.setJSON(user.id, updated)
    return Response.json({ user: updated })
  }

  return new Response('Not found', { status: 404 })
}
