import { getStore } from '@netlify/blobs'

function redactVehicleForPublic(vehicle: any) {
  const publicConditionCheckup = vehicle.shareConditionCheckup === true && vehicle.conditionCheckup
    ? Object.fromEntries(
        Object.entries(vehicle.conditionCheckup).filter(([key]) => key !== 'notes')
      )
    : undefined

  const publicEntries = Array.isArray(vehicle.entries)
    ? vehicle.entries.map((entry: any) => ({
        id: entry.id,
        type: entry.type,
        title: entry.title,
        cost: entry.cost,
        estimatedValueImpact: entry.estimatedValueImpact,
        date: entry.date,
        description: entry.description,
        attachments: Array.isArray(entry.attachments)
          ? entry.attachments.map((attachment: any) => ({
              key: attachment.key,
              name: attachment.name,
              type: attachment.type,
              size: attachment.size,
              uploadedAt: attachment.uploadedAt,
            }))
          : [],
      }))
    : []

  const publicMarketComps = Array.isArray(vehicle.marketComps)
    ? vehicle.marketComps.map((comp: any) => ({
        source: comp.source,
        url: comp.url,
        price: comp.price,
        mileage: comp.mileage,
        soldOrAsking: comp.soldOrAsking,
        dateAdded: comp.dateAdded,
      }))
    : undefined

  return {
    id: vehicle.id,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    color: vehicle.color,
    mileage: vehicle.mileage,
    photoKeys: Array.isArray(vehicle.photoKeys) ? vehicle.photoKeys : [],
    coverPhotoKey: vehicle.coverPhotoKey,
    visualIdentity: vehicle.visualIdentity
      ? {
          imageKey: vehicle.visualIdentity.imageKey,
          generatedAt: vehicle.visualIdentity.generatedAt,
          sourcePhotoKey: vehicle.visualIdentity.sourcePhotoKey,
        }
      : undefined,
    entries: publicEntries,
    marketComps: publicMarketComps,
    conditionCheckup: publicConditionCheckup,
    shareConditionCheckup: vehicle.shareConditionCheckup === true,
    createdAt: vehicle.createdAt,
    bookValue: vehicle.bookValue,
  }
}

export default async (req: Request) => {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return new Response('Missing id', { status: 400 })
    const store = getStore('vehicles')
    const vehicle = await store.get(id, { type: 'json' })
    if (!vehicle) return new Response('Not found', { status: 404 })
    return new Response(JSON.stringify(redactVehicleForPublic(vehicle)), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    })
  } catch {
    return new Response('Failed to load public vehicle', { status: 500 })
  }
}
