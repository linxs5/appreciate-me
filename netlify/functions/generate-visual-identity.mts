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

const MAX_REFERENCE_PHOTOS = 1
const MAX_OPENAI_IMAGE_BYTES = 50 * 1024 * 1024
const OPENAI_IMAGE_SIZE = '1024x1024'
const OPENAI_IMAGE_QUALITY = 'medium'
const OPENAI_TIMEOUT_MS = 45000
const SUPPORTED_REFERENCE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MISSING_OPENAI_KEY_MESSAGE = 'AI setup is missing. Add OPENAI_API_KEY in Netlify.'
const NO_PHOTOS_MESSAGE = 'Add at least one clear full-vehicle exterior photo first.'
const PHOTO_READ_FAILED_MESSAGE = 'Couldn’t read the saved vehicle photo. Try re-uploading it.'
const UNSUPPORTED_PHOTO_MESSAGE = 'Unsupported photo format. Upload a JPG, PNG, or WEBP.'
const PHOTO_TOO_LARGE_MESSAGE = 'Saved vehicle photo is too large for AI generation. Try re-uploading a smaller JPG, PNG, or WEBP.'
const OPENAI_FAILED_MESSAGE = 'AI generation failed from OpenAI. Try again later.'
const OPENAI_TIMEOUT_MESSAGE = 'AI generation timed out. Try again with one clear full-vehicle photo.'

class VisualIdentityError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

class OpenAiTimeoutError extends VisualIdentityError {
  constructor() {
    super(OPENAI_TIMEOUT_MESSAGE, 504)
  }
}

function buildPrompt(vehicle: VehicleLike) {
  const vehicleName = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(' ')
  const color = vehicle.color ? `The vehicle color is ${vehicle.color}.` : ''

  return `Create a premium studio asset-card image of this exact real vehicle for Appreciate Me.

Accuracy is more important than style. This is a stylized AI identity image, not verified proof, not a condition report, and not a true 3D model.
Use the reference photo as the source of truth. Recreate the same vehicle, not a cleaner, newer, lowered, customized, rarer, or more valuable version.

Preserve exactly:
- wheels and tire style
- stance and ride height
- paint color and paint condition
- trim and badging when visible
- grille, headlights, mirrors, bumpers, handles, and lights
- body panels, panel gaps, bed/cab configuration, roofline, and proportions
- scratches, dents, rust, faded paint, mismatched panels, wraps, primer, two-tone panels, and other visible condition details
- existing aftermarket parts only if they are visible in the reference photo

Composition:
- show the full vehicle in frame
- center the vehicle horizontally and vertically
- all wheels visible when the angle allows
- no cropped bumper, wheels, roof, mirrors, wing, or rear
- keep the same general vehicle angle as the reference when possible
- vehicle should occupy roughly 70-82% of the image width
- leave controlled breathing room around the vehicle
- reduce the original background influence; do not let houses, driveways, garages, trees, or street clutter dominate

Enhance:
- clean dark studio or premium listing-style background
- natural studio lighting
- restrained reflections
- restrained dark premium showroom, subtle graphite floor, or minimal asset-card environment
- crisp contrast
- soft defined shadows
- subtle Appreciate Me fintech/collector-card mood without text

Style:
- premium studio asset card of this exact vehicle
- buyer-trust oriented vehicle listing
- premium collectible vehicle identity card
- realistic automotive image with elevated presentation, not a fantasy render

Rules:
- no cartoon style
- no fake modifications
- no custom wheels unless present in the reference
- no lowering, lifted stance changes, widebody, body kits, spoilers, aero, extra accessories, or concept-car styling unless already visible
- no unrealistic paint, color changes, pristine repaint, or showroom restoration
- no making the vehicle look newer, cleaner, rarer, more expensive, or more collectible than it is
- no changing grille, headlights, cab, bed, body panels, trim, ride height, wheel size, tire style, or stance
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
- if uncertain about a detail, preserve the original reference detail instead of improving it

Vehicle: ${vehicleName || 'the provided vehicle'}. ${color}
Goal: Make a premium studio asset card of this exact vehicle while protecting buyer trust and preserving the real vehicle identity.`
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

function safePhotoLabel(key: string, index: number) {
  const parts = key.split('/')
  const fileName = parts[parts.length - 1] || key
  const extensionMatch = fileName.match(/\.([a-z0-9]+)$/i)
  return {
    candidateIndex: index,
    hasExtension: Boolean(extensionMatch),
    extension: extensionMatch?.[1]?.toLowerCase() || 'none',
  }
}

function normalizeContentType(contentType?: string) {
  const normalized = (contentType || '').split(';')[0].trim().toLowerCase()
  if (normalized === 'image/jpg' || normalized === 'image/pjpeg') return 'image/jpeg'
  return normalized
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
  return normalizeContentType(fallback) || 'application/octet-stream'
}

function extensionForContentType(contentType: string) {
  if (contentType === 'image/jpeg') return 'jpg'
  if (contentType === 'image/webp') return 'webp'
  return 'png'
}

function summarizeOpenAiError(status: number, raw: string) {
  const lower = raw.toLowerCase()
  if (lower.includes('insufficient_quota')) {
    return 'insufficient_quota'
  }
  if (lower.includes('rate_limit') || status === 429) {
    return 'rate_limited'
  }
  if (lower.includes('content_policy') || lower.includes('moderation')) {
    return 'moderation'
  }
  if (lower.includes('invalid_image') || lower.includes('unsupported')) {
    return 'invalid_or_unsupported_image'
  }
  if (lower.includes('image')) return 'image_api_error'
  return 'openai_error'
}

function openAiStatus(status: number, raw: string) {
  const reason = summarizeOpenAiError(status, raw)
  if (reason === 'insufficient_quota') return 'insufficient_quota'
  if (reason === 'rate_limited') return 'rate_limited'
  if (reason === 'moderation') return 'moderation'
  if (reason === 'invalid_or_unsupported_image') return 'invalid_or_unsupported_image'
  if (status === 401 || status === 403) return 'auth_or_project_access'
  if (status >= 500) return 'openai_server_error'
  return reason
}

function visualIdentityModel() {
  const configured = process.env.OPENAI_IMAGE_MODEL || ''
  if (configured.startsWith('gpt-image-')) return configured
  if (configured) {
    console.warn('visual-identity: ignoring unsupported image edit model', {
      configuredModel: configured,
      fallbackModel: 'gpt-image-1',
    })
  }
  return 'gpt-image-1'
}

async function generateFromPhotos(apiKey: string, model: string, prompt: string, references: PhotoReference[]) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)
  const formData = new FormData()
  formData.append('model', model)
  formData.append('prompt', prompt)
  formData.append('size', OPENAI_IMAGE_SIZE)
  formData.append('quality', OPENAI_IMAGE_QUALITY)
  // TODO: Re-enable multi-photo high-quality generation after the single-reference Netlify path is reliable.
  const imageFieldName = references.length > 1 ? 'image[]' : 'image'
  references.forEach((reference, index) => {
    const extension = extensionForContentType(reference.contentType)
    formData.append(
      imageFieldName,
      new File([reference.bytes], `vehicle-reference-${index + 1}.${extension}`, {
        type: reference.contentType,
      })
    )
  })

  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('visual-identity: OpenAI image edit timed out', {
        timeoutMs: OPENAI_TIMEOUT_MS,
        referenceCount: references.length,
        referenceTypes: references.map(reference => reference.contentType),
        referenceBytes: references.map(reference => reference.bytes.byteLength),
        model,
        outputSize: OPENAI_IMAGE_SIZE,
        quality: OPENAI_IMAGE_QUALITY,
      })
      throw new OpenAiTimeoutError()
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const rawError = await response.text().catch(() => 'OpenAI image edit failed.')
    const safeReason = openAiStatus(response.status, rawError)
    console.warn('visual-identity: OpenAI image edit failed', {
      status: response.status,
      reason: safeReason,
      referenceCount: references.length,
      referenceTypes: references.map(reference => reference.contentType),
      referenceBytes: references.map(reference => reference.bytes.byteLength),
      model,
      imageFieldName,
      outputSize: OPENAI_IMAGE_SIZE,
      quality: OPENAI_IMAGE_QUALITY,
      openAiRequestId: response.headers.get('x-request-id') || undefined,
      errorPreview: rawError.slice(0, 500),
    })
    throw new VisualIdentityError(OPENAI_FAILED_MESSAGE, response.status === 429 ? 429 : 502)
  }

  const data = await response.json()
  return imageBytesFromResult(data)
}

async function generateWithPhotoRetries(apiKey: string, model: string, prompt: string, references: PhotoReference[]) {
  const primaryReferences = references.slice(0, MAX_REFERENCE_PHOTOS)

  try {
    console.info('visual-identity: attempting multi-photo generation', {
      referenceCount: primaryReferences.length,
      referenceTypes: primaryReferences.map(reference => reference.contentType),
      referenceBytes: primaryReferences.map(reference => reference.bytes.byteLength),
      outputSize: OPENAI_IMAGE_SIZE,
      quality: OPENAI_IMAGE_QUALITY,
    })
    return await generateFromPhotos(apiKey, model, prompt, primaryReferences)
  } catch (error) {
    console.warn('visual-identity: multi-photo generation failed, retrying references individually', {
      referenceCount: primaryReferences.length,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }

  for (const [index, reference] of primaryReferences.entries()) {
    try {
      console.info('visual-identity: attempting single-photo generation', {
        referenceIndex: index,
        referenceType: reference.contentType,
        referenceBytes: reference.bytes.byteLength,
      })
      return await generateFromPhotos(apiKey, model, prompt, [reference])
    } catch (error) {
      console.warn('visual-identity: single-photo generation failed', {
        referenceIndex: index,
        referenceType: reference.contentType,
        referenceBytes: reference.bytes.byteLength,
        reason: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  throw new VisualIdentityError(OPENAI_FAILED_MESSAGE, 502)
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
  if (!apiKey?.trim()) {
    console.warn('visual-identity: missing OPENAI_API_KEY')
    return new Response(MISSING_OPENAI_KEY_MESSAGE, { status: 500 })
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
    console.warn('visual-identity: no vehicle photo keys in payload', {
      hasCoverPhotoKey: Boolean(vehicle.coverPhotoKey),
      photoKeyCount: vehicle.photoKeys?.length || 0,
    })
    return new Response(NO_PHOTOS_MESSAGE, { status: 400 })
  }

  const photoStore = getStore('vehicle-photos')
  const references: PhotoReference[] = []
  let photoReadFailures = 0
  let unsupportedPhotos = 0
  let oversizedPhotos = 0
  for (const [candidateIndex, photoKey] of candidatePhotoKeys.entries()) {
    if (references.length >= MAX_REFERENCE_PHOTOS) break
    const photoLabel = safePhotoLabel(photoKey, candidateIndex)
    let sourcePhoto: ArrayBuffer | null
    let sourceMeta: Awaited<ReturnType<typeof photoStore.getMetadata>>
    try {
      sourcePhoto = await photoStore.get(photoKey, { type: 'arrayBuffer' })
      sourceMeta = await photoStore.getMetadata(photoKey)
    } catch (error) {
      photoReadFailures += 1
      console.warn('visual-identity: failed to read photo blob', {
        ...photoLabel,
        reason: error instanceof Error ? error.message : 'unknown',
      })
      continue
    }

    if (!sourcePhoto) {
      photoReadFailures += 1
      console.warn('visual-identity: photo blob missing', photoLabel)
      continue
    }

    if (sourcePhoto.byteLength > MAX_OPENAI_IMAGE_BYTES) {
      oversizedPhotos += 1
      console.warn('visual-identity: skipping oversized photo blob', {
        ...photoLabel,
        byteLength: sourcePhoto.byteLength,
        maxBytes: MAX_OPENAI_IMAGE_BYTES,
      })
      continue
    }

    const contentType = detectImageContentType(
      sourcePhoto,
      sourceMeta?.metadata?.contentType as string | undefined
    )
    if (!SUPPORTED_REFERENCE_CONTENT_TYPES.has(contentType)) {
      unsupportedPhotos += 1
      console.warn('visual-identity: skipping unsupported photo blob', {
        ...photoLabel,
        detectedContentType: contentType,
        metadataContentType: sourceMeta?.metadata?.contentType,
        byteLength: sourcePhoto.byteLength,
      })
      continue
    }

    console.info('visual-identity: using photo blob reference', {
      ...photoLabel,
      detectedContentType: contentType,
      metadataContentType: sourceMeta?.metadata?.contentType,
      byteLength: sourcePhoto.byteLength,
      referenceIndex: references.length,
    })
    references.push({ key: photoKey, bytes: sourcePhoto, contentType })
  }

  if (references.length === 0) {
    console.warn('visual-identity: no usable photo references', {
      candidatePhotoCount: candidatePhotoKeys.length,
      photoReadFailures,
      unsupportedPhotos,
      oversizedPhotos,
    })
    if (photoReadFailures > 0) {
      return new Response(PHOTO_READ_FAILED_MESSAGE, { status: 404 })
    }
    if (oversizedPhotos > 0) {
      return new Response(PHOTO_TOO_LARGE_MESSAGE, { status: 413 })
    }
    if (unsupportedPhotos > 0) {
      return new Response(UNSUPPORTED_PHOTO_MESSAGE, { status: 415 })
    }
    return new Response(NO_PHOTOS_MESSAGE, { status: 400 })
  }

  const prompt = buildPrompt(vehicle)
  const model = visualIdentityModel()
  console.info('visual-identity: prepared generation request', {
    model,
    candidatePhotoCount: candidatePhotoKeys.length,
    usableReferenceCount: references.length,
    referenceTypes: references.map(reference => reference.contentType),
    referenceBytes: references.map(reference => reference.bytes.byteLength),
    outputSize: OPENAI_IMAGE_SIZE,
    quality: OPENAI_IMAGE_QUALITY,
    timeoutMs: OPENAI_TIMEOUT_MS,
  })

  try {
    const generatedImage = await generateWithPhotoRetries(apiKey.trim(), model, prompt, references)

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
    const status = error instanceof VisualIdentityError ? error.status : 500
    return new Response(
      error instanceof Error ? error.message : OPENAI_FAILED_MESSAGE,
      { status }
    )
  }
}

export const config = { path: '/.netlify/functions/generate-visual-identity' }
