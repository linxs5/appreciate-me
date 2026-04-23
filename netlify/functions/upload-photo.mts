import { getStore } from '@netlify/blobs'

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const vehicleId = formData.get('vehicleId') as string | null

    if (!file || !vehicleId) {
      return new Response('Missing file or vehicleId', { status: 400 })
    }

    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ]

    if (!allowedTypes.includes(file.type)) {
      return new Response('Unsupported file type', { status: 400 })
    }

    const photoStore = getStore('vehicle-photos')
    const vehicleStore = getStore('vehicles')

    const photoId = crypto.randomUUID()
    const extension =
      file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
        ? 'webp'
        : 'jpg'

    const key = `${vehicleId}/${photoId}.${extension}`

    await photoStore.set(key, file, {
      metadata: { contentType: file.type || 'image/jpeg' },
    })

    const vehicle = await vehicleStore.get(vehicleId, { type: 'json' }) as any

    if (vehicle) {
      const newKeys = [...(vehicle.photoKeys || []), key]
      await vehicleStore.setJSON(vehicleId, { ...vehicle, photoKeys: newKeys })
    }

    return Response.json({ key })
  } catch (error) {
    console.error('upload-photo failed:', error)
    return new Response('Upload failed', { status: 500 })
  }
}

export const config = { path: '/.netlify/functions/upload-photo' }
