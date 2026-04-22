import { getStore } from '@netlify/blobs'

export default async (req: Request) => {
  const store = getStore('vehicles')

  if (req.method === 'GET') {
    const { blobs } = await store.list()
    const vehicles = await Promise.all(
      blobs.map(async (b) => {
        const data = await store.get(b.key, { type: 'json' })
        return data
      })
    )
    return Response.json(vehicles.filter(Boolean).sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ))
  }

  if (req.method === 'POST') {
    const body = await req.json()
    const id = crypto.randomUUID()
    const vehicle = {
      id,
      year: body.year,
      make: body.make,
      model: body.model,
      trim: body.trim || null,
      color: body.color || null,
      mileage: body.mileage || 0,
      vin: body.vin || null,
      photoKeys: [],
      entries: [],
      createdAt: new Date().toISOString(),
    }
    await store.setJSON(id, vehicle)
    return Response.json(vehicle, { status: 201 })
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return new Response('Missing id', { status: 400 })
    await store.delete(id)
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config = { path: '/.netlify/functions/vehicles' }
