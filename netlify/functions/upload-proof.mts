import { getStore } from '@netlify/blobs'

const SESSION_COOKIE = 'am_session'
const MAX_FILE_BYTES = 15 * 1024 * 1024
const linkedTypes = new Set(['vehicle', 'logEntry', 'buildPost', 'valueTask'])
const proofTypes = new Set([
  'PHOTO',
  'RECEIPT',
  'INVOICE',
  'REPORT',
  'VIDEO',
  'MEASUREMENT',
  'OTHER',
  'receipt',
  'work_photo',
  'before',
  'after',
  'part_screenshot',
  'shop_invoice',
  'mileage_photo',
  'condition_photo',
  'damage_photo',
  'install_proof',
  'document',
  'other',
])
const allowedTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
])
const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

type UserProfile = {
  id: string
  email: string
  username: string
  displayName?: string
  createdAt: string
  updatedAt?: string
}

function parseCookie(req: Request, name: string) {
  const cookie = req.headers.get('cookie') || ''
  const match = cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ''
}

async function getProfile(userId: string): Promise<UserProfile | null> {
  const profileStore = getStore('user-profiles')
  return profileStore.get(userId, { type: 'json' }) as Promise<UserProfile | null>
}

async function requireUser(req: Request): Promise<UserProfile | null> {
  const sessionId = parseCookie(req, SESSION_COOKIE)
  if (!sessionId) return null
  const sessionStore = getStore('auth-sessions')
  const session: any = await sessionStore.get(sessionId, { type: 'json' })
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    await sessionStore.delete(sessionId).catch(() => {})
    return null
  }
  return getProfile(session.userId)
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeMimeType(type: string) {
  if (type === 'image/jpg' || type === 'image/pjpeg') return 'image/jpeg'
  return type
}

function inferMimeType(file: File) {
  const normalized = normalizeMimeType(file.type || '')
  if (allowedTypes.has(normalized)) return normalized
  const name = file.name || ''
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg'
  if (/\.png$/i.test(name)) return 'image/png'
  if (/\.webp$/i.test(name)) return 'image/webp'
  if (/\.mp4$/i.test(name)) return 'video/mp4'
  if (/\.mov$/i.test(name)) return 'video/quicktime'
  if (/\.pdf$/i.test(name)) return 'application/pdf'
  return normalized
}

function extensionForMimeType(type: string) {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  if (type === 'video/mp4') return 'mp4'
  if (type === 'video/quicktime') return 'mov'
  if (type === 'application/pdf') return 'pdf'
  return 'jpg'
}

function safeFileName(name: string, mimeType: string) {
  const fallback = `proof.${extensionForMimeType(mimeType)}`
  return (name || fallback).replace(/[^\w.\-]+/g, '_').slice(0, 120) || fallback
}

function findProof(vehicle: any, key: string) {
  const vehicleProof = Array.isArray(vehicle?.proofAttachments) ? vehicle.proofAttachments : []
  const postProof = Array.isArray(vehicle?.buildPostProofAttachments) ? vehicle.buildPostProofAttachments : []
  return [...vehicleProof, ...postProof].find((proof: any) => proof?.fileKey === key)
}

function validateLinkedRecord(vehicle: any, linkedType: string, linkedId: string) {
  if (linkedType === 'vehicle') return linkedId === vehicle.id
  if (linkedType === 'logEntry') {
    return Array.isArray(vehicle.entries) && vehicle.entries.some((entry: any) => entry.id === linkedId)
  }
  if (linkedType === 'valueTask') {
    return Array.isArray(vehicle.valueTasks) && vehicle.valueTasks.some((task: any) => task.id === linkedId)
  }
  return linkedType === 'buildPost'
}

function findProofById(vehicle: any, proofId: string) {
  const proofs = Array.isArray(vehicle?.proofAttachments) ? vehicle.proofAttachments : []
  return proofs.find((proof: any) => proof?.id === proofId)
}

function publicProofPatch(body: any) {
  const label = cleanString(body?.label, 80)
  const note = cleanString(body?.note, 500)
  const proofType = cleanString(body?.proofType, 40)
  return {
    label: label || undefined,
    note: note || undefined,
    proofType: proofTypes.has(proofType) ? proofType : 'OTHER',
    visibility: body?.visibility === 'public_safe' ? 'public_safe' : 'private',
  }
}

async function syncBuildPostProof(proof: any, action: 'update' | 'delete') {
  if (proof?.linkedType !== 'buildPost' || !proof?.linkedId) return
  const postStore = getStore('community-posts')
  const post: any = await postStore.get(proof.linkedId, { type: 'json' })
  if (!post) return
  const currentProof = Array.isArray(post.proofAttachments) ? post.proofAttachments : []
  const proofAttachments = action === 'delete'
    ? currentProof.filter((item: any) => item.id !== proof.id)
    : currentProof.map((item: any) => item.id === proof.id ? proof : item)
  await postStore.setJSON(proof.linkedId, {
    ...post,
    proofAttachments,
    updatedAt: new Date().toISOString(),
  })
}

export default async (req: Request) => {
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const key = cleanString(url.searchParams.get('key'), 320)
    if (!key) return new Response('Missing key', { status: 400 })

    const proofStore = getStore('proof-attachments')
    const meta = await proofStore.getMetadata(key)
    const vehicleId = cleanString(meta?.metadata?.vehicleId, 120) || key.split('/')[0]
    if (!vehicleId) return new Response('Not found', { status: 404 })

    const vehicleStore = getStore('vehicles')
    const vehicle: any = await vehicleStore.get(vehicleId, { type: 'json' })
    if (!vehicle) return new Response('Not found', { status: 404 })

    const proof = findProof(vehicle, key) || {
      visibility: meta?.metadata?.visibility,
      uploadedBy: meta?.metadata?.uploadedBy,
    }
    const user = await requireUser(req)
    const isOwner = user && vehicle.ownerId === user.id
    if (!isOwner && proof?.visibility !== 'public_safe') {
      return new Response('Unauthorized', { status: 401 })
    }

    const blob = await proofStore.get(key, { type: 'arrayBuffer' })
    if (!blob) return new Response('Not found', { status: 404 })

    const contentType = (meta?.metadata?.contentType as string) || 'application/octet-stream'
    const fileName = (meta?.metadata?.fileName as string) || 'proof'
    return new Response(blob, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': proof?.visibility === 'public_safe' ? 'public, max-age=300' : noStoreHeaders['Cache-Control'],
      },
    })
  }

  if (req.method === 'PUT') {
    const user = await requireUser(req)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const proofId = cleanString(url.searchParams.get('id'), 120)
    if (!proofId) return new Response('Missing proof id', { status: 400 })
    const body = await req.json().catch(() => ({}))
    const vehicleId = cleanString(body?.vehicleId, 120)
    if (!vehicleId) return new Response('Missing vehicleId', { status: 400 })

    const vehicleStore = getStore('vehicles')
    const vehicle: any = await vehicleStore.get(vehicleId, { type: 'json' })
    if (!vehicle) return new Response('Vehicle not found', { status: 404 })
    if (vehicle.ownerId !== user.id) return new Response('Forbidden', { status: 403 })

    const existingProof = findProofById(vehicle, proofId)
    if (!existingProof) return new Response('Proof not found', { status: 404 })

    const patch = publicProofPatch(body)
    const updatedProof = {
      ...existingProof,
      label: patch.label,
      note: patch.note,
      proofType: patch.proofType,
      visibility: patch.visibility,
    }
    const proofAttachments = (Array.isArray(vehicle.proofAttachments) ? vehicle.proofAttachments : [])
      .map((proof: any) => proof.id === proofId ? updatedProof : proof)
    await vehicleStore.setJSON(vehicleId, {
      ...vehicle,
      proofAttachments,
    })
    await syncBuildPostProof(updatedProof, 'update')
    return Response.json({ proof: updatedProof }, { headers: noStoreHeaders })
  }

  if (req.method === 'DELETE') {
    const user = await requireUser(req)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const proofId = cleanString(url.searchParams.get('id'), 120)
    const vehicleId = cleanString(url.searchParams.get('vehicleId'), 120)
    if (!proofId || !vehicleId) return new Response('Missing proof id or vehicleId', { status: 400 })

    const vehicleStore = getStore('vehicles')
    const vehicle: any = await vehicleStore.get(vehicleId, { type: 'json' })
    if (!vehicle) return new Response('Vehicle not found', { status: 404 })
    if (vehicle.ownerId !== user.id) return new Response('Forbidden', { status: 403 })

    const existingProof = findProofById(vehicle, proofId)
    if (!existingProof) return new Response('Proof not found', { status: 404 })

    const proofAttachments = (Array.isArray(vehicle.proofAttachments) ? vehicle.proofAttachments : [])
      .filter((proof: any) => proof.id !== proofId)
    await vehicleStore.setJSON(vehicleId, {
      ...vehicle,
      proofAttachments,
    })
    await syncBuildPostProof(existingProof, 'delete')
    const proofStore = getStore('proof-attachments')
    await proofStore.delete(existingProof.fileKey).catch(() => {})
    return new Response(null, { status: 204, headers: noStoreHeaders })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const user = await requireUser(req)
  if (!user) return new Response('Unauthorized', { status: 401 })

  const formData = await req.formData().catch(() => null)
  if (!formData) return new Response('Invalid form data', { status: 400 })

  const file = formData.get('file')
  const vehicleId = cleanString(formData.get('vehicleId'), 120)
  const linkedType = cleanString(formData.get('linkedType'), 32)
  const rawLinkedId = cleanString(formData.get('linkedId'), 120)
  const label = cleanString(formData.get('label'), 80)
  const note = cleanString(formData.get('note'), 500)
  const rawProofType = cleanString(formData.get('proofType'), 40)
  const visibility = formData.get('visibility') === 'public_safe' ? 'public_safe' : 'private'

  if (!(file instanceof File) || !vehicleId || !linkedTypes.has(linkedType)) {
    return new Response('Missing file, vehicleId, or linked type', { status: 400 })
  }

  const linkedId = rawLinkedId || (linkedType === 'vehicle' ? vehicleId : '')
  if (!linkedId) return new Response('Missing linked record', { status: 400 })

  if (file.size > MAX_FILE_BYTES) {
    return new Response('File is too large. Upload photos, videos, or PDF proof files under 15MB.', { status: 400 })
  }

  const mimeType = inferMimeType(file)
  if (!allowedTypes.has(mimeType)) {
    return new Response('Unsupported file type. Upload JPG, PNG, WEBP, MP4, MOV, or PDF proof files.', { status: 400 })
  }

  const vehicleStore = getStore('vehicles')
  const vehicle: any = await vehicleStore.get(vehicleId, { type: 'json' })
  if (!vehicle) return new Response('Vehicle not found', { status: 404 })
  if (vehicle.ownerId !== user.id) return new Response('Forbidden', { status: 403 })
  if (!validateLinkedRecord(vehicle, linkedType, linkedId)) {
    return new Response('Linked record not found on this vehicle', { status: 404 })
  }

  let targetPost: any = null
  if (linkedType === 'buildPost') {
    const postStore = getStore('community-posts')
    targetPost = await postStore.get(linkedId, { type: 'json' })
    if (!targetPost) return new Response('Build post not found', { status: 404 })
    if (targetPost.ownerId !== user.id) return new Response('Forbidden', { status: 403 })
    if (targetPost.vehicleId !== vehicleId && targetPost.buildVehicleId !== vehicleId) {
      return new Response('Build post is not linked to this vehicle', { status: 400 })
    }
  }

  const proofId = crypto.randomUUID()
  const fileName = safeFileName(file.name, mimeType)
  const fileKey = `${vehicleId}/${linkedType}/${linkedId}/${proofId}.${extensionForMimeType(mimeType)}`
  const uploadedAt = new Date().toISOString()
  const proof = {
    id: proofId,
    vehicleId,
    linkedType,
    linkedId,
    fileKey,
    fileName,
    fileType: mimeType,
    mimeType,
    fileSize: file.size,
    uploadedAt,
    uploadedBy: user.id,
    ...(label ? { label } : {}),
    ...(note ? { note } : {}),
    proofType: proofTypes.has(rawProofType) ? rawProofType : 'OTHER',
    visibility,
  }

  const proofStore = getStore('proof-attachments')
  await proofStore.set(fileKey, await file.arrayBuffer(), {
    metadata: {
      contentType: mimeType,
      fileName,
      vehicleId,
      linkedType,
      linkedId,
      uploadedBy: user.id,
      visibility,
    },
  })

  const nextVehicleProof = [...(Array.isArray(vehicle.proofAttachments) ? vehicle.proofAttachments : []), proof]
  await vehicleStore.setJSON(vehicleId, {
    ...vehicle,
    proofAttachments: nextVehicleProof,
  })

  if (targetPost) {
    const postStore = getStore('community-posts')
    await postStore.setJSON(linkedId, {
      ...targetPost,
      proofAttachments: [...(Array.isArray(targetPost.proofAttachments) ? targetPost.proofAttachments : []), proof],
      updatedAt: uploadedAt,
    })
  }

  return Response.json({ proof }, { status: 201, headers: noStoreHeaders })
}
