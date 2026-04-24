import { getStore } from '@netlify/blobs'

export default async (req: Request) => {
  const store = getStore('vehicles')
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return new Response('Missing id', { status: 400 })
  }

  if (req.method === 'GET') {
    const vehicle = await store.get(id, { type: 'json' })
    if (!vehicle) {
      return new Response('Not found', { status: 404 })
    }
    return Response.json(vehicle)
  }

  if (req.method === 'PUT') {
    const existing: any = await store.get(id, { type: 'json' })

    if (!existing) {
      return new Response('Not found', { status: 404 })
    }

    const body = await req.json()
    let updated = { ...existing }

    if (body.action === 'add-entry' && body.entry) {
      updated.entries = [
        {
          id: crypto.randomUUID(),
          ...body.entry,
          photoKeys: body.entry.photoKeys || [],
        },
        ...(existing.entries || []),
      ]
    } else if (body.action === 'update-entry' && body.entryId && body.entry) {
      updated.entries = (existing.entries || []).map((e: any) =>
        e.id === body.entryId
          ? {
              ...e,
              ...body.entry,
              id: e.id,
              photoKeys: body.entry.photoKeys ?? e.photoKeys ?? [],
            }
          : e
      )
    } else if (body.action === 'delete-entry' && body.entryId) {
      updated.entries = (existing.entries || []).filter(
        (e: any) => e.id !== body.entryId
      )
    } else if (body.action === 'update-vehicle') {
      const { action, ...patch } = body

      const nextPhotoKeys = patch.photoKeys ?? existing.photoKeys ?? []
      const nextCoverPhotoKey =
        patch.coverPhotoKey !== undefined
          ? patch.coverPhotoKey
          : existing.coverPhotoKey

      updated = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        entries: existing.entries,
        photoKeys: nextPhotoKeys,
        coverPhotoKey:
          nextCoverPhotoKey && nextPhotoKeys.includes(nextCoverPhotoKey)
            ? nextCoverPhotoKey
            : nextPhotoKeys[0] || undefined,
      }
    } else {
      const { action, ...patch } = body
      updated = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
      }
    }

    await store.setJSON(id, updated)
    return Response.json(updated)
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config = { path: '/.netlify/functions/vehicle' }