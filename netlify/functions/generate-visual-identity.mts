import { getStore } from '@netlify/blobs'

type VehicleLike = {
  id?: string
  year?: number
  make?: string
  model?: string
  trim?: string
  color?: string
  coverPhotoKey?: string
  photoKeys?: string[]
  visualIdentity?: {
    generationCount?: number
  }
}

type VisualIdentity = {
  imageKey: string
  generatedAt: string
  sourcePhotoKey?: string
  referencePhotoKeys?: string[]
  prompt?: string
  generationCount?: number
  assetKind?: 'single_visual_identity'
  futureSpinSet?: {
    status: 'not_generated'
    requiredAngles: string[]
  }
}

type PhotoReference = {
  key: string
  bytes: ArrayBuffer
  contentType: string
}

const MAX_REFERENCE_PHOTOS = 4
const SUPPORTED_REFERENCE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function buildPrompt(vehicle: VehicleLike) {
  const vehicleName = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(' ')
  const color = vehicle.color ? `The vehicle color is ${vehicle.color}.` : ''

  return `Create a premium stylized visual identity image of this exact vehicle for Appreciate Me.

This is a reference-led identity render, not a proof image and not a true 3D model.
Use all provided vehicle photos as references. Treat the first image as the primary composition/reference and the remaining images as supporting references for exact details, modifications, panel colors, trim, stance, wheels, aero, damage, scratches, and visible body differences.

Preserve:
- exact body shape
- exact color relationships, including mismatched panels, wraps, primer, black hoods, gray bodies, faded paint, or two-tone panels
- real proportions
- real stance
- visible major features from the source photos
- spoilers, lips, splitters, roof racks, aftermarket wheels, lowered suspension, stickers, scratches, dents, rust, trim/body differences, and other visible mods or imperfections

Composition:
- show the full vehicle in frame
- center the vehicle horizontally and vertically
- all wheels visible when the angle allows
- no cropped bumper, wheels, roof, mirrors, wing, or rear
- clean 3/4 automotive asset angle unless the references strongly indicate a better full-vehicle angle
- vehicle should occupy roughly 70-82% of the image width
- leave controlled breathing room around the vehicle
- reduce the original background influence; do not let houses, driveways, garages, trees, or street clutter dominate

Enhance:
- dramatic studio lighting
- clean glossy reflections
- restrained dark premium showroom, subtle graphite floor, or minimal asset-card environment
- crisp contrast
- soft defined shadows
- subtle Appreciate Me fintech/collector-card mood without text

Style:
- luxury car marketplace
- fintech asset dashboard
- premium collectible vehicle identity card
- realistic automotive render with elevated lighting, not a cartoon

Rules:
- no cartoon style
- no fake modifications
- no text overlays
- no logos
- no exaggerated changes
- no close-up crop
- no cropped bumper
- no cropped wheels
- no cropped roof
- no partial vehicle
- no extreme zoom
- no tight framing
- do not hide real mismatched colors, visible wear, scratches, or modifications
- do not invent pristine paint if the references show damage or mismatched panels
- do not create a 3D turntable, multi-angle sheet, exploded view, or 360 spin
- keep it realistic but elevated

Vehicle: ${vehicleName || 'the provided vehicle'}. ${color}
Goal: Make this actual vehicle feel like a valuable stylized digital asset while preserving the real vehicle identity.`
}

function bufferFromBase64(value: string) {
  return Uint8Array.from(Buffer.from(value, 'base64'))
}

async function imageBytesFromResult(result: unknown) {
  const data = result && typeof result === 'object'
    ? (result as { data?: Array<{ b64_json?: unknown; url?: unknown }> }).data
    : undefined
  const firstImage = Array.isArray(data) ? data[0] : undefined
  const base64 = firstImage?.b64_json
  if (typeof base64 === 'string' && base64) {
    return bufferFromBase64(base64)
  }

  const imageUrl = firstImage?.url
  if (typeof imageUrl === 'string' && imageUrl) {
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error('Image generation returned a URL that could not be fetched.')
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  throw new Error('Image generation did not return image data.')
}

function detectImageContentType(bytes: ArrayBuffer, fallback?: string) {
  const view = new Uint8Array(bytes.slice(0, 16))
  if (view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) return 'image/jpeg'
  if (
    view[0] === 0x89 &&
    view[1] === 0x50 &&
    view[2] === 0x4e &&
    view[3] === 0x47
  ) return 'image/png'
  if (
    view[0] === 0x52 &&
    view[1] === 0x49 &&
    view[2] === 0x46 &&
    view[3] === 0x46 &&
    view[8] === 0x57 &&
    view[9] === 0x45 &&
    view[10] === 0x42 &&
    view[11] === 0x50
  ) return 'image/webp'
  return fallback || 'application/octet-stream'
}

function extensionForContentType(contentType: string) {
  if (contentType === 'image/jpeg') return 'jpg'
  if (contentType === 'image/webp') return 'webp'
  return 'png'
}

function imageErrorMessage(status: number, raw: string) {
  const lower = raw.toLowerCase()
  if (lower.includes('insufficient_quota')) {
    return 'Visual identity generation is temporarily unavailable because the AI account has no available image credits.'
  }
  if (lower.includes('rate_limit') || status === 429) {
    return 'Visual identity generation is busy right now. Please wait a moment and try again.'
  }
  if (lower.includes('content_policy') || lower.includes('moderation')) {
    return 'Visual identity generation could not use one of these photos because it was blocked by the image safety system. Try a clearer exterior photo.'
  }
  if (lower.includes('invalid_image') || lower.includes('unsupported') || lower.includes('image')) {
    return 'Visual identity generation needs clear JPG, PNG, or WEBP vehicle photos. Try setting a supported full-car exterior photo as the cover image.'
  }
  return 'Visual identity generation failed while creating the asset image. Try again with a clear full-car exterior photo, or upload another angle first.'
}

async function generateFromPhotos(apiKey: string, model: string, prompt: string, references: PhotoReference[]) {
  const formData = new FormData()
  formData.append('model', model)
  formData.append('prompt', prompt)
  formData.append('size', '1536x1024')
  formData.append('quality', 'high')
  references.forEach((reference, index) => {
    const extension = extensionForContentType(reference.contentType)
    formData.append(
      'image',
      new File([reference.bytes], `vehicle-reference-${index + 1}.${extension}`, {
        type: reference.contentType,
      })
    )
  })

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!response.ok) {
    const rawError = await response.text().catch(() => 'OpenAI image edit failed.')
    throw new Error(imageErrorMessage(response.status, rawError))
  }

  const data = await response.json()
  return imageBytesFromResult(data)
}

export default async (req: Request) => {
  const visualStore = getStore('visual-identities')

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const key = url.searchParams.get('key')
    if (!key) return new Response('Missing key', { status: 400 })

    const blob = await visualStore.get(key, { type: 'arrayBuffer' })
    const meta = await visualStore.getMetadata(key)
    if (!blob) return new Response('Not found', { status: 404 })

    return new Response(blob, {
      headers: {
        'Content-Type': (meta?.metadata?.contentType as string) || 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response('Missing OPENAI_API_KEY environment variable.', { status: 500 })
  }

  let vehicle: VehicleLike
  try {
    const body = await req.json()
    vehicle = body?.vehicle
  } catch {
    return new Response('Invalid JSON body.', { status: 400 })
  }

  if (!vehicle || typeof vehicle !== 'object') {
    return new Response('Missing vehicle JSON in POST body.', { status: 400 })
  }

  const existingGenerationCount = vehicle.visualIdentity
    ? vehicle.visualIdentity.generationCount || 1
    : 0
  if (existingGenerationCount >= 3) {
    return new Response('Visual identity generation limit reached for this vehicle.', { status: 429 })
  }

  const candidatePhotoKeys = [
    vehicle.coverPhotoKey,
    ...(vehicle.photoKeys || []),
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index)

  if (candidatePhotoKeys.length === 0) {
    return new Response('Add at least one vehicle photo before generating a visual identity.', { status: 400 })
  }

  const photoStore = getStore('vehicle-photos')
  const references: PhotoReference[] = []
  for (const photoKey of candidatePhotoKeys) {
    if (references.length >= MAX_REFERENCE_PHOTOS) break
    const sourcePhoto = await photoStore.get(photoKey, { type: 'arrayBuffer' })
    const sourceMeta = await photoStore.getMetadata(photoKey)
    if (!sourcePhoto) continue
    const contentType = detectImageContentType(
      sourcePhoto,
      sourceMeta?.metadata?.contentType as string | undefined
    )
    if (!SUPPORTED_REFERENCE_CONTENT_TYPES.has(contentType)) continue
    references.push({ key: photoKey, bytes: sourcePhoto, contentType })
  }

  if (references.length === 0) {
    return new Response(
      'Visual identity needs at least one supported JPG, PNG, or WEBP vehicle photo. Set a clear full-car exterior photo as the cover image and try again.',
      { status: 400 }
    )
  }

  const prompt = buildPrompt(vehicle)
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'

  try {
    const generatedImage = await generateFromPhotos(apiKey, model, prompt, references)

    const imageKey = `${vehicle.id || 'vehicle'}/${crypto.randomUUID()}.png`
    const generatedAt = new Date().toISOString()
    const referencePhotoKeys = references.map(reference => reference.key)

    await visualStore.set(imageKey, generatedImage, {
      metadata: {
        contentType: 'image/png',
        sourcePhotoKey: referencePhotoKeys[0],
        referencePhotoKeys,
        generatedAt,
      },
    })

    const visualIdentity: VisualIdentity = {
      imageKey,
      generatedAt,
      sourcePhotoKey: referencePhotoKeys[0],
      referencePhotoKeys,
      prompt,
      generationCount: existingGenerationCount + 1,
      assetKind: 'single_visual_identity',
      futureSpinSet: {
        status: 'not_generated',
        requiredAngles: ['front_three_quarter', 'side_profile', 'rear_three_quarter', 'interior_detail'],
      },
    }

    return Response.json(visualIdentity)
  } catch (error) {
    console.error('generate-visual-identity failed:', error)
    return new Response(
      error instanceof Error ? error.message : 'Failed to generate visual identity.',
      { status: 500 }
    )
  }
}

export const config = { path: '/.netlify/functions/generate-visual-identity' }
