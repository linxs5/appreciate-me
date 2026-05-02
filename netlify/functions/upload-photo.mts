import { getStore } from '@netlify/blobs'

const SESSION_COOKIE = 'am_session'

function parseCookie(req: Request, name: string) {
  const cookie = req.headers.get('cookie') || ''
  const match = cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ''
}

async function currentUserId(req: Request) {
  const sessionId = parseCookie(req, SESSION_COOKIE)
  if (!sessionId) return null
  const sessionStore = getStore('auth-sessions')
  const session: any = await sessionStore.get(sessionId, { type: 'json' })
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null
  return typeof session.userId === 'string' ? session.userId : null
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    const vehicleIdRaw = formData.get('vehicleId')
    const vehicleId =
      typeof vehicleIdRaw === 'string' ? vehicleIdRaw.trim() : null

    if (!(file instanceof File) || !vehicleId) {
      return new Response('Missing file or vehicleId', { status: 400 })
    }

    const allowedTypes = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ])

    const normalizedType =
      file.type === 'image/pjpeg' ? 'image/jpeg' : file.type

    if (!allowedTypes.has(normalizedType)) {
      return new Response(
        JSON.stringify({
          error: `Unsupported file type: ${normalizedType || 'unknown'}`,
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }
      )
    }

    const extension =
      normalizedType === 'image/png'
        ? 'png'
        : normalizedType === 'image/webp'
        ? 'webp'
        : 'jpg'

    const photoStore = getStore('vehicle-photos')
    const vehicleStore = getStore('vehicles')

    const vehicle = await vehicleStore.get(vehicleId, { type: 'json' }) as any
    if (!vehicle) return new Response('Vehicle not found', { status: 404 })

    const userId = await currentUserId(req)
    if (!userId) return new Response('Unauthorized', { status: 401 })
    if (vehicle.ownerId !== userId) return new Response('Forbidden', { status: 403 })

    const photoId = crypto.randomUUID()
    const key = `${vehicleId}/${photoId}.${extension}`

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    await photoStore.set(key, bytes, {
      metadata: {
        contentType: normalizedType,
        originalName: file.name,
        size: file.size,
      },
    })

    const newKeys = [...(vehicle.photoKeys || []), key]
    const coverPhotoKey = vehicle.coverPhotoKey || newKeys[0]

    await vehicleStore.setJSON(vehicleId, {
      ...vehicle,
      photoKeys: newKeys,
      coverPhotoKey,
    })

    return new Response(JSON.stringify({ key }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    console.error('upload-photo failed:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Upload failed',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    )
  }
}
