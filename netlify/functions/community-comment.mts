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

const optionalUser = requireUser

function cleanString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function authError(message = 'Unauthorized') {
  return new Response(message, { status: 401 })
}

function commentKey(postId: string, commentId: string) {
  return `${postId}:${commentId}`
}

async function commentsForPost(commentStore: ReturnType<typeof getStore>, postId: string) {
  const { blobs } = await commentStore.list({ prefix: `${postId}:` })
  return (await Promise.all(blobs.map(blob => commentStore.get(blob.key, { type: 'json' }))))
    .filter(Boolean)
}

function postVisibility(post: any) {
  return post?.visibility === 'public' ? 'public' : 'members'
}

function canViewPost(post: any, user: UserProfile | null) {
  return postVisibility(post) === 'public' || Boolean(user)
}

function publicComment(comment: any, user: UserProfile | null) {
  if (user) return comment
  const {
    ownerId: _ownerId,
    appreciateUserIds: _appreciateUserIds,
    ...safeComment
  } = comment
  return {
    ...safeComment,
    appreciateUserIds: [],
  }
}

async function visiblePostIds(postStore: ReturnType<typeof getStore>, user: UserProfile | null) {
  const { blobs } = await postStore.list()
  const posts = (await Promise.all(blobs.map(blob => postStore.get(blob.key, { type: 'json' }))))
    .filter(Boolean)
    .filter(post => canViewPost(post, user))
  return new Set(posts.map((post: any) => post.id).filter((id: unknown): id is string => typeof id === 'string'))
}

export default async (req: Request) => {
  const url = new URL(req.url)
  const postStore = getStore('community-posts')
  const commentStore = getStore('community-comments')

  if (req.method === 'GET') {
    const user = await optionalUser(req)
    const postId = cleanString(url.searchParams.get('postId'), 120)
    let comments: any[] = []
    if (postId) {
      const post: any = await postStore.get(postId, { type: 'json' })
      if (!post) return new Response('Post not found', { status: 404 })
      if (!canViewPost(post, user)) return authError()
      comments = await commentsForPost(commentStore, postId)
    } else {
      const viewablePostIds = await visiblePostIds(postStore, user)
      comments = (await Promise.all((await commentStore.list()).blobs.map(blob => commentStore.get(blob.key, { type: 'json' }))))
        .filter((comment: any) => comment && viewablePostIds.has(comment.postId))
    }
    return Response.json({
      comments: comments
        .map(comment => publicComment(comment, user))
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    })
  }

  const user = await requireUser(req)
  if (!user) return authError()

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    const postId = cleanString(body.postId, 120)
    const commentBody = cleanString(body.body, 3000)
    const parentId = cleanString(body.parentId, 120)
    if (!postId || !commentBody) return new Response('Missing post or body', { status: 400 })

    const post: any = await postStore.get(postId, { type: 'json' })
    if (!post) return new Response('Post not found', { status: 404 })

    let parent: any = null
    if (parentId) {
      parent = await commentStore.get(commentKey(postId, parentId), { type: 'json' })
      if (!parent) return new Response('Parent comment not found', { status: 404 })
      if (parent.parentId) return new Response('Replies can only be one level deep', { status: 400 })
    }

    const createdAt = new Date().toISOString()
    const comment = {
      id: crypto.randomUUID(),
      postId,
      parentId: parent ? parent.id : undefined,
      ownerId: user.id,
      ownerUsername: user.username,
      ownerDisplayName: user.displayName,
      body: commentBody,
      appreciateUserIds: [],
      appreciateCount: 0,
      createdAt,
    }
    const updatedPost = {
      ...post,
      commentCount: Math.max(0, (post.commentCount || 0) + 1),
      updatedAt: createdAt,
    }

    await commentStore.setJSON(commentKey(postId, comment.id), comment)
    await postStore.setJSON(postId, updatedPost)
    return Response.json({ comment, post: updatedPost }, { status: 201 })
  }

  const id = cleanString(url.searchParams.get('id'), 120)
  if (!id) return new Response('Missing id', { status: 400 })

  const { blobs } = await commentStore.list()
  let key = ''
  let comment: any = null
  for (const blob of blobs) {
    const item: any = await commentStore.get(blob.key, { type: 'json' })
    if (item?.id === id) {
      key = blob.key
      comment = item
      break
    }
  }
  if (!comment) return new Response('Not found', { status: 404 })

  if (req.method === 'PUT') {
    const body = await req.json().catch(() => ({}))
    if (body.action === 'toggle-appreciation') {
      const currentIds = Array.isArray(comment.appreciateUserIds) ? comment.appreciateUserIds : []
      const appreciated = currentIds.includes(user.id)
      const appreciateUserIds = appreciated
        ? currentIds.filter((ownerId: string) => ownerId !== user.id)
        : [...currentIds, user.id]
      const updated = {
        ...comment,
        appreciateUserIds,
        appreciateCount: appreciateUserIds.length,
        updatedAt: new Date().toISOString(),
      }
      await commentStore.setJSON(key, updated)
      return Response.json({ comment: updated })
    }

    if (comment.ownerId !== user.id) return new Response('Forbidden', { status: 403 })
    const commentBody = body.body === undefined ? comment.body : cleanString(body.body, 3000)
    if (!commentBody) return new Response('Missing body', { status: 400 })
    const updated = { ...comment, body: commentBody, updatedAt: new Date().toISOString() }
    await commentStore.setJSON(key, updated)
    return Response.json({ comment: updated })
  }

  if (req.method === 'DELETE') {
    if (comment.ownerId !== user.id) return new Response('Forbidden', { status: 403 })
    const post: any = await postStore.get(comment.postId, { type: 'json' })
    const postComments = await commentsForPost(commentStore, comment.postId)
    const deletedIds = [comment.id, ...postComments.filter((item: any) => item.parentId === comment.id).map((item: any) => item.id)]
    await Promise.all(deletedIds.map(commentId => commentStore.delete(commentKey(comment.postId, commentId))))
    const updatedPost = post
      ? {
          ...post,
          commentCount: Math.max(0, (post.commentCount || 0) - deletedIds.length),
          updatedAt: new Date().toISOString(),
        }
      : null
    if (updatedPost) await postStore.setJSON(comment.postId, updatedPost)
    return Response.json({ deletedIds, post: updatedPost })
  }

  return new Response('Method not allowed', { status: 405 })
}
