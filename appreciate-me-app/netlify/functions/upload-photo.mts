import { getStore } from '@netlify/blobs'

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const vehicleId = formData.get('vehicleId') as string | null
  if (!file || !vehicleId) return new Response('Missing file or vehicleId', { status: 400 })

  const photoStore = getStore('vehicle-photos')
  const vehicleStore = getStore('vehicles')

  const photoId = crypto.randomUUID()
  const key = `${vehicleId}/${photoId}`
  const buffer = await file.arrayBuffer()
  await photoStore.set(key, buffer, {
    metadata: { contentType: file.type || 'image/jpeg' },
  })

  // Append photo key to vehicle
  const vehicle: any = await vehicleStore.get(vehicleId, { type: 'json' })
  if (vehicle) {
    const newKeys = [...(vehicle.photoKeys || []), key]
    await vehicleStore.setJSON(vehicleId, { ...vehicle, photoKeys: newKeys })
  }

  return Response.json({ key })
}

export const config = { path: '/.netlify/functions/upload-photo' }
