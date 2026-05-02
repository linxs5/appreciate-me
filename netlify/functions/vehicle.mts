import { getStore } from '@netlify/blobs'

const SESSION_COOKIE = 'am_session'

type UserProfile = {
  id: string
  email: string
  username: string
  displayName?: string
  createdAt: string
  updatedAt?: string
}

function valueTaskLogType(category?: string): 'maintenance' | 'repair' {
  if (category === 'repair') return 'repair'
  return 'maintenance'
}

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10)
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

function authError(message = 'Unauthorized') {
  return new Response(message, { status: 401 })
}

function ownsVehicle(user: UserProfile, vehicle: any) {
  return vehicle?.ownerId === user.id
}

export default async (req: Request) => {
  const store = getStore('vehicles')
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return new Response('Missing id', { status: 400 })
  }

  if (req.method === 'GET') {
    const user = await requireUser(req)
    if (!user) return authError()
    const vehicle = await store.get(id, { type: 'json' })
    if (!vehicle) {
      return new Response('Not found', { status: 404 })
    }
    if (!ownsVehicle(user, vehicle)) return new Response('Forbidden', { status: 403 })
    return Response.json(vehicle)
  }

  if (req.method === 'PUT') {
    const user = await requireUser(req)
    if (!user) return authError()
    const existing: any = await store.get(id, { type: 'json' })

    if (!existing) {
      return new Response('Not found', { status: 404 })
    }

    const body = await req.json()
    let updated = { ...existing }

    if (body.action === 'claim-legacy-vehicle') {
      if (existing.ownerId) return new Response('Vehicle already claimed', { status: 409 })
      updated = {
        ...existing,
        ownerId: user.id,
        ownerUsername: user.username,
      }
      await store.setJSON(id, updated)
      return Response.json(updated)
    }

    if (!ownsVehicle(user, existing)) return new Response('Forbidden', { status: 403 })

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
    } else if (body.action === 'complete-value-task' && body.taskId) {
      const completedAt = new Date().toISOString()
      let completedTask: any = null
      const valueTasks = (existing.valueTasks || []).map((task: any) => {
        if (task.id !== body.taskId) return task
        completedTask = task
        return {
          ...task,
          status: 'completed',
          completedAt: task.completedAt || completedAt,
        }
      })

      if (!completedTask) {
        return new Response('Value task not found', { status: 404 })
      }

      const entries = Array.isArray(existing.entries) ? existing.entries : []

      updated = {
        ...existing,
        valueTasks,
        entries: body.convertToLog === true
          ? [
              ...entries,
              {
                id: crypto.randomUUID(),
                type: valueTaskLogType(completedTask.category),
                title: completedTask.title,
                cost: typeof completedTask.estimatedCost === 'number' && Number.isFinite(completedTask.estimatedCost)
                  ? completedTask.estimatedCost
                  : 0,
                date: todayDateInputValue(),
                description: completedTask.notes,
                photoKeys: [],
              },
            ]
          : entries,
      }
    } else if (body.action === 'update-vehicle') {
      const { action, ownerId, ownerUsername, userId, ...patch } = body

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
        ownerId: existing.ownerId,
        ownerUsername: existing.ownerUsername,
        entries: existing.entries,
        photoKeys: nextPhotoKeys,
        coverPhotoKey:
          nextCoverPhotoKey && nextPhotoKeys.includes(nextCoverPhotoKey)
            ? nextCoverPhotoKey
            : nextPhotoKeys[0] || undefined,
      }
    } else {
      const { action, ownerId, ownerUsername, userId, ...patch } = body
      updated = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        ownerId: existing.ownerId,
        ownerUsername: existing.ownerUsername,
      }
    }

    await store.setJSON(id, updated)
    return Response.json(updated)
  }

  return new Response('Method not allowed', { status: 405 })
}
