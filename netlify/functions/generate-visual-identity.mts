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
  prompt?: string
  generationCount?: number
}

function buildPrompt(vehicle: VehicleLike) {
  const vehicleName = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(' ')
  const color = vehicle.color ? `The vehicle color is ${vehicle.color}.` : ''

  return `Create a high-end automotive digital asset render of this exact vehicle.

Preserve:
- exact body shape
- exact color
- real proportions
- real stance
- visible major features from the source photo

Enhance:
- dramatic studio lighting
- clean glossy reflections
- dark premium showroom or black grid background
- crisp contrast
- soft defined shadows

Style:
- luxury car marketplace
- fintech asset dashboard
- Bring a Trailer meets Bloomberg terminal

Rules:
- no cartoon style
- no fake modifications
- no text overlays
- no logos
- no exaggerated changes
- keep it realistic but elevated

Vehicle: ${vehicleName || 'the provided vehicle'}. ${color}
Goal: Make this vehicle look like a valuable, collectible asset.`
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

async function generateFromPhoto(apiKey: string, model: string, prompt: string, photo: ArrayBuffer, contentType: string) {
  const formData = new FormData()
  formData.append('model', model)
  formData.append('prompt', prompt)
  formData.append('size', '1024x1024')
  formData.append('image', new File([photo], 'cover-photo.png', { type: contentType || 'image/png' }))

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await response.text().catch(() => 'OpenAI image edit failed.'))
  }

  const data = await response.json()
  return imageBytesFromResult(data)
}

async function generateFromText(apiKey: string, model: string, prompt: string) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      size: '1024x1024',
    }),
  })

  if (!response.ok) {
    throw new Error(await response.text().catch(() => 'OpenAI image generation failed.'))
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

  const sourcePhotoKey = vehicle.coverPhotoKey || vehicle.photoKeys?.[0]
  if (!sourcePhotoKey) {
    return new Response('Add a cover photo before generating a visual identity.', { status: 400 })
  }

  const photoStore = getStore('vehicle-photos')
  const sourcePhoto = await photoStore.get(sourcePhotoKey, { type: 'arrayBuffer' })
  const sourceMeta = await photoStore.getMetadata(sourcePhotoKey)

  if (!sourcePhoto) {
    return new Response('Cover photo could not be found.', { status: 404 })
  }

  const prompt = buildPrompt(vehicle)
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'

  try {
    let generatedImage: Uint8Array
    try {
      generatedImage = await generateFromPhoto(
        apiKey,
        model,
        prompt,
        sourcePhoto,
        (sourceMeta?.metadata?.contentType as string) || 'image/png'
      )
    } catch (error) {
      console.warn('Image edit failed, falling back to text-to-image:', error)
      generatedImage = await generateFromText(apiKey, model, prompt)
    }

    const imageKey = `${vehicle.id || 'vehicle'}/${crypto.randomUUID()}.png`
    const generatedAt = new Date().toISOString()

    await visualStore.set(imageKey, generatedImage, {
      metadata: {
        contentType: 'image/png',
        sourcePhotoKey,
        generatedAt,
      },
    })

    const visualIdentity: VisualIdentity = {
      imageKey,
      generatedAt,
      sourcePhotoKey,
      prompt,
      generationCount: existingGenerationCount + 1,
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
