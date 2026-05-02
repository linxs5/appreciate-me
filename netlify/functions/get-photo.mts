import { getStore } from '@netlify/blobs'

export default async (req: Request) => {
  const url = new URL(req.url)
  const key = url.searchParams.get('key')
  if (!key) return new Response('Missing key', { status: 400 })

  const store = getStore('vehicle-photos')
  const blob = await store.get(key, { type: 'arrayBuffer' })
  const meta = await store.getMetadata(key)

  if (!blob) return new Response('Not found', { status: 404 })

  return new Response(blob, {
    headers: {
      'Content-Type': (meta?.metadata?.contentType as string) || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
