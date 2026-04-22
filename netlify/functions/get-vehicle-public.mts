import { getStore } from '@netlify/blobs'

export default async (req: Request) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return new Response('Missing id', { status: 400 })
  const store = getStore('vehicles')
  const vehicle = await store.get(id, { type: 'json' })
  if (!vehicle) return new Response('Not found', { status: 404 })
  return new Response(JSON.stringify(vehicle), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
  })
}

export const config = { path: '/.netlify/functions/get-vehicle-public' }
