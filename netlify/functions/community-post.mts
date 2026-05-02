import { getStore } from '@netlify/blobs'

const SESSION_COOKIE = 'am_session'
const postTypes = new Set(['build_update', 'question', 'valuation_check', 'showcase', 'proof_drop'])

type UserProfile = {
  id: string
  email: string
  username: string
  displayName?: string
  createdAt: string
  updatedAt?: string
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

function cleanString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function authError(message = 'Unauthorized') {
  return new Response(message, { status: 401 })
}

export default async (req: Request) => {
  const user = await requireUser(req)
  if (!user) return authError()

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return new Response('Missing id', { status: 400 })

  const postStore = getStore('community-posts')
  const post: any = await postStore.get(id, { type: 'json' })
  if (!post) return new Response('Not found', { status: 404 })

  if (req.method === 'PUT') {
    const body = await req.json().catch(() => ({}))

    if (body.action === 'toggle-appreciation') {
      const currentIds = Array.isArray(post.appreciateUserIds) ? post.appreciateUserIds : []
      const appreciated = currentIds.includes(user.id)
      const appreciateUserIds = appreciated
        ? currentIds.filter((ownerId: string) => ownerId !== user.id)
        : [...currentIds, user.id]
      const updated = {
        ...post,
        appreciateUserIds,
        appreciateCount: appreciateUserIds.length,
        updatedAt: new Date().toISOString(),
      }
      await postStore.setJSON(id, updated)
      return Response.json({ post: updated })
    }

    if (post.ownerId !== user.id) return new Response('Forbidden', { status: 403 })
    const title = body.title === undefined ? post.title : cleanString(body.title, 120)
    const postBody = body.body === undefined ? post.body : cleanString(body.body, 5000)
    if (!title || !postBody) return new Response('Missing title or body', { status: 400 })
    const updated = {
      ...post,
      title,
      body: postBody,
      type: postTypes.has(body.type) ? body.type : post.type,
      tags: Array.isArray(body.tags) ? body.tags.map((tag: unknown) => cleanString(tag, 32)).filter(Boolean).slice(0, 8) : post.tags,
      updatedAt: new Date().toISOString(),
    }
    await postStore.setJSON(id, updated)
    return Response.json({ post: updated })
  }

  if (req.method === 'DELETE') {
    if (post.ownerId !== user.id) return new Response('Forbidden', { status: 403 })
    const commentStore = getStore('community-comments')
    const { blobs } = await commentStore.list()
    await Promise.all(
      blobs
        .filter(blob => blob.key.startsWith(`${id}:`))
        .map(blob => commentStore.delete(blob.key))
    )
    await postStore.delete(id)
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
}
