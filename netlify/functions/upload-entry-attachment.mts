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
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const vehicleId = formData.get('vehicleId') as string | null
  const entryId = formData.get('entryId') as string | null
  if (!file || !vehicleId || !entryId) {
    return new Response('Missing file, vehicleId, or entryId', { status: 400 })
  }

  // Basic type guard: images + PDFs at minimum. Allow other common doc types too.
  const type = file.type || 'application/octet-stream'
  const isAllowed =
    type.startsWith('image/') ||
    type === 'application/pdf' ||
    type === 'application/octet-stream'
  if (!isAllowed) {
    return new Response('Unsupported file type', { status: 415 })
  }

  const attachmentStore = getStore('entry-attachments')
  const vehicleStore = getStore('vehicles')

  const vehicle: any = await vehicleStore.get(vehicleId, { type: 'json' })
  if (!vehicle) return new Response('Vehicle not found', { status: 404 })

  const userId = await currentUserId(req)
  if (!userId) return new Response('Unauthorized', { status: 401 })
  if (vehicle.ownerId !== userId) return new Response('Forbidden', { status: 403 })

  const existingEntries = Array.isArray(vehicle.entries) ? vehicle.entries : []
  if (!existingEntries.some((entry: any) => entry.id === entryId)) {
    return new Response('Entry not found', { status: 404 })
  }

  const fileId = crypto.randomUUID()
  const safeName = (file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 120)
  const key = `${vehicleId}/${entryId}/${fileId}-${safeName}`

  const buffer = await file.arrayBuffer()
  await attachmentStore.set(key, buffer, {
    metadata: { contentType: type, name: safeName },
  })

  const attachment = {
    key,
    name: safeName,
    type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  }

  const entries = existingEntries.map((e: any) =>
    e.id === entryId
      ? { ...e, attachments: [...(e.attachments || []), attachment] }
      : e
  )

  await vehicleStore.setJSON(vehicleId, { ...vehicle, entries })

  return Response.json({ attachment })
}
