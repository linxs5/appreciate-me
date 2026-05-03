import { getStore } from '@netlify/blobs'

const SESSION_COOKIE = 'am_session'
const postTypes = new Set(['build_update', 'question', 'valuation_check', 'showcase', 'proof_drop'])
const postVisibilities = new Set(['public', 'members'])
const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

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

const optionalUser = requireUser

function normalizeImageType(type: string) {
  if (type === 'image/jpg' || type === 'image/pjpeg') return 'image/jpeg'
  return type
}

function imageExtension(type: string) {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

function postVisibility(post: any) {
  return post?.visibility === 'public' ? 'public' : 'members'
}

function canViewPost(post: any, user: UserProfile | null) {
  return postVisibility(post) === 'public' || Boolean(user)
}

export default async (req: Request) => {
  const url = new URL(req.url)
  const imageKey = cleanString(url.searchParams.get('imageKey'), 260)
  if (req.method === 'GET' && imageKey) {
    const user = await optionalUser(req)
    const [postId] = imageKey.split('/')
    if (!postId) return new Response('Missing image key', { status: 400 })

    const postStore = getStore('community-posts')
    const post: any = await postStore.get(postId, { type: 'json' })
    if (!post) return new Response('Not found', { status: 404 })
    if (!canViewPost(post, user)) return authError()
    if (!Array.isArray(post.buildPhotoKeys) || !post.buildPhotoKeys.includes(imageKey)) {
      return new Response('Not found', { status: 404 })
    }

    const photoStore = getStore('community-build-photos')
    const blob = await photoStore.get(imageKey, { type: 'arrayBuffer' })
    const meta = await photoStore.getMetadata(imageKey)
    if (!blob) return new Response('Not found', { status: 404 })
    return new Response(blob, {
      headers: {
        'Content-Type': (meta?.metadata?.contentType as string) || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  const user = await requireUser(req)
  if (!user) return authError()

  const id = url.searchParams.get('id')
  if (req.method !== 'POST' && !id) return new Response('Missing id', { status: 400 })

  const postStore = getStore('community-posts')
  const post: any = id ? await postStore.get(id, { type: 'json' }) : null
  if (req.method !== 'POST' && !post) return new Response('Not found', { status: 404 })

  if (req.method === 'POST') {
    const formData = await req.formData().catch(() => null)
    if (!formData) return new Response('Invalid form data', { status: 400 })
    const file = formData.get('file')
    const postId = cleanString(formData.get('postId'), 120)
    const vehicleId = cleanString(formData.get('vehicleId'), 120)
    if (!(file instanceof File) || !postId || !vehicleId) {
      return new Response('Missing file, postId, or vehicleId', { status: 400 })
    }

    const targetPost: any = await postStore.get(postId, { type: 'json' })
    if (!targetPost) return new Response('Post not found', { status: 404 })
    if (targetPost.ownerId !== user.id) return new Response('Forbidden', { status: 403 })
    if (targetPost.vehicleId !== vehicleId && targetPost.buildVehicleId !== vehicleId) {
      return new Response('Post is not linked to this vehicle', { status: 400 })
    }

    const vehicleStore = getStore('vehicles')
    const vehicle: any = await vehicleStore.get(vehicleId, { type: 'json' })
    if (!vehicle) return new Response('Vehicle not found', { status: 404 })
    if (vehicle.ownerId !== user.id) return new Response('Forbidden', { status: 403 })

    const currentKeys = Array.isArray(targetPost.buildPhotoKeys) ? targetPost.buildPhotoKeys : []
    if (currentKeys.length >= 6) return new Response('Build posts can have up to 6 photos.', { status: 400 })

    const normalizedType = normalizeImageType(file.type)
    if (!allowedImageTypes.has(normalizedType)) {
      return new Response('Unsupported image type. Use JPG, PNG, or WEBP.', { status: 400 })
    }

    const photoId = crypto.randomUUID()
    const key = `${postId}/${photoId}.${imageExtension(normalizedType)}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const photoStore = getStore('community-build-photos')
    await photoStore.set(key, bytes, {
      metadata: {
        contentType: normalizedType,
        ownerId: user.id,
        vehicleId,
        postId,
        originalName: file.name,
        size: file.size,
      },
    })

    const updated = {
      ...targetPost,
      buildPhotoKeys: [...currentKeys, key],
      updatedAt: new Date().toISOString(),
    }
    await postStore.setJSON(postId, updated)
    return Response.json({ post: updated })
  }

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
      visibility: postVisibilities.has(body.visibility) ? body.visibility : (post.visibility || 'members'),
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
