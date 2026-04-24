import { getStore } from '@netlify/blobs'

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

  const fileId = crypto.randomUUID()
  const safeName = (file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 120)
  const key = `${vehicleId}/${entryId}/${fileId}-${safeName}`

  const buffer = await file.arrayBuffer()
  await attachmentStore.set(key, buffer, {
    metadata: { contentType: type, name: safeName },
  })

  const vehicle: any = await vehicleStore.get(vehicleId, { type: 'json' })
  if (!vehicle) return new Response('Vehicle not found', { status: 404 })

  const attachment = {
    key,
    name: safeName,
    type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  }

  const entries = (vehicle.entries || []).map((e: any) =>
    e.id === entryId
      ? { ...e, attachments: [...(e.attachments || []), attachment] }
      : e
  )

  await vehicleStore.setJSON(vehicleId, { ...vehicle, entries })

  return Response.json({ attachment })
}

export const config = { path: '/.netlify/functions/upload-entry-attachment' }
