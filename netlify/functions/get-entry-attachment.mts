import { getStore } from '@netlify/blobs'

export default async (req: Request) => {
  const url = new URL(req.url)
  const key = url.searchParams.get('key')
  if (!key) return new Response('Missing key', { status: 400 })

  const store = getStore('entry-attachments')
  const blob = await store.get(key, { type: 'arrayBuffer' })
  const meta = await store.getMetadata(key)

  if (!blob) return new Response('Not found', { status: 404 })

  const contentType = (meta?.metadata?.contentType as string) || 'application/octet-stream'
  const name = (meta?.metadata?.name as string) || 'file'

  return new Response(blob, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

export const config = { path: '/.netlify/functions/get-entry-attachment' }
