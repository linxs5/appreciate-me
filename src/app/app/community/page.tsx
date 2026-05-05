'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  createCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  getCommunityComments,
  getCommunityPosts,
  getVehicles,
  buildPhotoUrl,
  photoUrl,
  toggleCommunityCommentAppreciation,
  toggleCommunityPostAppreciation,
} from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import type { CommunityComment, CommunityPost, CommunityPostType, CommunityPostVisibility, UserProfile, Vehicle } from '@/lib/types'

const postTypeLabels: Record<CommunityPostType, string> = {
  build_update: 'BUILD UPDATE',
  question: 'QUESTION',
  valuation_check: 'VALUATION CHECK',
  showcase: 'SHOWCASE',
  proof_drop: 'PROOF DROP',
}

type FilterMode = 'all' | 'builds' | 'my_vehicles' | 'make' | 'model' | 'year'
type SaveStatus = 'saving' | 'synced'
type UiPost = CommunityPost & { saveStatus?: SaveStatus }
type UiComment = CommunityComment & { saveStatus?: SaveStatus }
type CommunityVehicleSnapshot = NonNullable<CommunityPost['vehicleSnapshot']>

const LIVE_REFRESH_INTERVAL_MS = 8000
const TEMP_ID_PREFIX = 'optimistic-'

function bodyPreview(body: string) {
  return body.length > 220 ? `${body.slice(0, 220).trim()}...` : body
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2
  return sorted[middle]
}

function formatCurrency(value: number) {
  return `$${Math.round(Math.abs(value)).toLocaleString()}`
}

function vehicleCommunityKey(year?: number, make?: string, model?: string) {
  return `${year || ''}|${make || ''}|${model || ''}`
}

function getConditionReadiness(vehicle: Vehicle): 'STRONG' | 'MODERATE' | 'NEEDS ATTENTION' {
  let strong = 0
  let caution = 0
  let needsAttention = 0
  Object.entries(vehicle.conditionCheckup || {}).forEach(([key, value]) => {
    if (['updatedAt', 'knownIssues', 'recentService', 'modifications', 'notes'].includes(key)) return
    if (value === true || value === 'excellent' || value === 'good' || value === 'none' || value === 'new' || value === 'smooth' || value === 'clean') strong += 1
    if (value === 'fair' || value === 'minor' || value === 'normal' || value === 'partial' || value === 'unknown' || value === 'minor_issues') caution += 1
    if (value === false || value === 'poor' || value === 'severe' || value === 'major' || value === 'heavy' || value === 'not_working' || value === 'major_issues' || value === 'salvage' || value === 'rebuilt' || value === 'needs_replacement' || value === 'needs_service') needsAttention += 1
  })
  if (needsAttention > 0) return 'NEEDS ATTENTION'
  if (caution > 2 || strong === 0) return 'MODERATE'
  return 'STRONG'
}

function getVehiclePreview(vehicle: Vehicle) {
  const marketComps = vehicle.marketComps || []
  const soldPrices = marketComps
    .filter(comp => comp.soldOrAsking === 'sold')
    .map(comp => comp.price)
    .filter(price => Number.isFinite(price))
  const allPrices = marketComps
    .map(comp => comp.price)
    .filter(price => Number.isFinite(price))
  const valuationPrices = soldPrices.length > 0 ? soldPrices : allPrices
  const estimatedMarketValue = median(valuationPrices)
  const soldCompCount = marketComps.filter(comp => comp.soldOrAsking === 'sold').length
  const marketConfidence = soldCompCount >= 5 ? 'HIGH' : soldCompCount >= 2 ? 'MEDIUM' : marketComps.length > 0 ? 'LOW' : undefined
  const proofCount = vehicle.entries.reduce((sum, entry) => sum + (entry.attachments?.length || 0), 0)
  const coverPhotoKey = vehicle.coverPhotoKey || vehicle.photoKeys?.[0]
  return {
    imageUrl: coverPhotoKey ? photoUrl(coverPhotoKey) : null,
    estimatedMarketValue,
    marketConfidence,
    proofCount,
    conditionReadiness: getConditionReadiness(vehicle),
  }
}

function authorName(item: Pick<CommunityPost | CommunityComment, 'ownerDisplayName' | 'ownerUsername'>) {
  return item.ownerDisplayName || (item.ownerUsername ? `@${item.ownerUsername}` : 'Community member')
}

function visibilityLabel(visibility?: CommunityPostVisibility) {
  return visibility === 'public' ? 'PUBLIC' : 'MEMBERS ONLY'
}

function linkedBuildVehicleId(post: CommunityPost) {
  return post.buildVehicleId || post.vehicleId || ''
}

function isOptimisticId(id: string) {
  return id.startsWith(TEMP_ID_PREFIX)
}

function mergeSavingPosts(current: UiPost[], incoming: CommunityPost[]): UiPost[] {
  const incomingIds = new Set(incoming.map(post => post.id))
  const saving = current.filter(post => post.saveStatus === 'saving' && !incomingIds.has(post.id))
  return [...saving, ...incoming.map(post => ({ ...post }))]
}

function mergeSavingComments(current: UiComment[], incoming: CommunityComment[]): UiComment[] {
  const incomingIds = new Set(incoming.map(comment => comment.id))
  const saving = current.filter(comment => comment.saveStatus === 'saving' && !incomingIds.has(comment.id))
  return [...incoming.map(comment => ({ ...comment })), ...saving]
}

function vehicleSnapshotTitle(snapshot?: CommunityPost['vehicleSnapshot']) {
  return [snapshot?.year, snapshot?.make, snapshot?.model, snapshot?.trim].filter(Boolean).join(' ')
}

function CommentThread({
  comments,
  postId,
  currentUser,
  replyTarget,
  replyBody,
  pendingAppreciationId,
  pendingDeleteId,
  pendingCommentPostId,
  onStartReply,
  onReplyBodyChange,
  onSubmitReply,
  onToggleAppreciation,
  onDeleteComment,
}: {
  comments: UiComment[]
  postId: string
  currentUser: UserProfile | null
  replyTarget: string | null
  replyBody: string
  pendingAppreciationId: string | null
  pendingDeleteId: string | null
  pendingCommentPostId: string | null
  onStartReply: (commentId: string) => void
  onReplyBodyChange: (value: string) => void
  onSubmitReply: (postId: string, parentId?: string) => void
  onToggleAppreciation: (commentId: string) => void
  onDeleteComment: (commentId: string) => void
}) {
  const topLevel = comments
    .filter(comment => comment.postId === postId && !comment.parentId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  if (topLevel.length === 0) return null

  function renderComment(comment: UiComment, depth = 0) {
    const replies = comments
      .filter(item => item.parentId === comment.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const appreciated = !!currentUser && comment.appreciateUserIds.includes(currentUser.id)
    const canDelete = !!currentUser && comment.ownerId === currentUser.id
    const canInteract = !!currentUser

    return (
      <div key={comment.id} style={{ borderLeft: depth > 0 ? '1px solid var(--border)' : 'none', paddingLeft: depth > 0 ? 12 : 0, marginLeft: depth > 0 ? 14 : 0 }}>
        <div style={{ background: '#0e0e0d', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em' }}>
              {authorName(comment)}
            </span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.06em' }}>
              {comment.saveStatus === 'saving' ? 'Commenting...' : new Date(comment.createdAt).toLocaleString()}
            </span>
          </div>
          <div style={{ color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>{comment.body}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onToggleAppreciation(comment.id)}
              disabled={pendingAppreciationId === comment.id || comment.saveStatus === 'saving'}
              style={{ background: 'transparent', border: 'none', color: appreciated ? '#00e87a' : 'var(--gray)', cursor: canInteract ? 'pointer' : 'not-allowed', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: 0 }}
            >
              {pendingAppreciationId === comment.id ? 'Saving...' : appreciated ? 'APPRECIATED' : 'APPRECIATE THIS'}
            </button>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)' }}>
              {comment.appreciateCount} Appreciation{comment.appreciateCount === 1 ? '' : 's'}
            </span>
            {depth === 0 && (
              <button
                type="button"
                onClick={() => onStartReply(comment.id)}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: canInteract ? 'pointer' : 'not-allowed', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: 0 }}
              >
                REPLY
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDeleteComment(comment.id)}
                disabled={pendingDeleteId === comment.id}
                style={{ background: 'transparent', border: 'none', color: '#ff7a7a', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: 0 }}
              >
                DELETE
              </button>
            )}
            {comment.saveStatus === 'synced' && (
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.06em' }}>
                Updated just now
              </span>
            )}
          </div>
          {replyTarget === comment.id && (
            <div style={{ marginTop: 10 }}>
              <textarea
                value={replyBody}
                onChange={e => onReplyBodyChange(e.target.value)}
                placeholder="Write a reply..."
                style={{ width: '100%', minHeight: 64, resize: 'vertical', background: '#111110', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--off-white)', padding: '9px 10px', fontFamily: 'DM Sans, sans-serif', fontSize: 13, outline: 'none' }}
              />
              <button
                type="button"
                onClick={() => onSubmitReply(postId, comment.id)}
                disabled={!replyBody.trim()}
                style={{ marginTop: 8, background: 'var(--accent)', border: 'none', color: 'var(--black)', cursor: replyBody.trim() ? 'pointer' : 'not-allowed', opacity: replyBody.trim() ? 1 : 0.5, fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', padding: '7px 10px', borderRadius: 4 }}
              >
                {pendingCommentPostId === postId ? 'Commenting...' : 'POST REPLY'}
              </button>
            </div>
          )}
        </div>
        {replies.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {replies.map(reply => renderComment(reply, 1))}
          </div>
        )}
      </div>
    )
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{topLevel.map(comment => renderComment(comment))}</div>
}

function CommunityPageContent() {
  const searchParams = useSearchParams()
  const vehicleFilterId = searchParams.get('vehicleId') || ''
  const liveStatusTimerRef = useRef<number | null>(null)
  const refreshInFlightRef = useRef(false)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [posts, setPosts] = useState<UiPost[]>([])
  const [comments, setComments] = useState<UiComment[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [liveStatus, setLiveStatus] = useState('Live updates on')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [filterValue, setFilterValue] = useState('')
  const [replyTarget, setReplyTarget] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [newCommentBody, setNewCommentBody] = useState<Record<string, string>>({})
  const [publishingPost, setPublishingPost] = useState(false)
  const [pendingPostAppreciationId, setPendingPostAppreciationId] = useState<string | null>(null)
  const [pendingCommentAppreciationId, setPendingCommentAppreciationId] = useState<string | null>(null)
  const [pendingCommentPostId, setPendingCommentPostId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    body: '',
    type: 'build_update' as CommunityPostType,
    visibility: 'public' as CommunityPostVisibility,
    vehicleId: '',
  })

  function requireSignIn() {
    setErrorMessage('Sign in to post, comment, or appreciate.')
  }

  const settleLiveStatus = useCallback(() => {
    if (liveStatusTimerRef.current) window.clearTimeout(liveStatusTimerRef.current)
    liveStatusTimerRef.current = window.setTimeout(() => {
      setLiveStatus('Live updates on')
      liveStatusTimerRef.current = null
    }, 1600)
  }, [])

  const refreshCommunityFeed = useCallback(async (options: { showStatus?: boolean } = {}) => {
    if (refreshInFlightRef.current) return
    refreshInFlightRef.current = true
    if (options.showStatus) setLiveStatus('Refreshing...')
    try {
      const [postData, commentData] = await Promise.all([
        getCommunityPosts(),
        getCommunityComments(),
      ])
      setPosts(current => mergeSavingPosts(current, postData))
      setComments(current => mergeSavingComments(current, commentData))
      setLiveStatus('Updated just now')
      settleLiveStatus()
    } catch {
      if (options.showStatus) {
        setLiveStatus('Live updates on')
      }
    } finally {
      refreshInFlightRef.current = false
    }
  }, [settleLiveStatus])

  useEffect(() => {
    let mounted = true
    async function loadCommunity() {
      setLoading(true)
      setErrorMessage('')
      const user = await getCurrentUser()
      if (!mounted) return
      setCurrentUser(user)
      try {
        const [vehicleData, postData, commentData] = user
          ? await Promise.all([
              getVehicles(),
              getCommunityPosts(),
              getCommunityComments(),
            ])
          : await Promise.all([
              Promise.resolve([] as Vehicle[]),
              getCommunityPosts(),
              getCommunityComments(),
            ])
        if (!mounted) return
        setVehicles(vehicleData)
        setPosts(postData)
        setComments(commentData)
        setLiveStatus('Updated just now')
        settleLiveStatus()
      } catch {
        if (!mounted) return
        setErrorMessage('Could not load comments.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    loadCommunity()
    return () => {
      mounted = false
      if (liveStatusTimerRef.current) window.clearTimeout(liveStatusTimerRef.current)
    }
  }, [settleLiveStatus])

  useEffect(() => {
    if (loading) return
    const interval = window.setInterval(() => {
      refreshCommunityFeed({ showStatus: true })
    }, LIVE_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [loading, refreshCommunityFeed])

  const selectedVehicle = vehicles.find(vehicle => vehicle.id === form.vehicleId)
  const makes = useMemo(() => Array.from(new Set([...vehicles.map(v => v.make), ...posts.map(p => p.make)].filter(Boolean) as string[])).sort(), [vehicles, posts])
  const models = useMemo(() => Array.from(new Set([...vehicles.map(v => v.model), ...posts.map(p => p.model)].filter(Boolean) as string[])).sort(), [vehicles, posts])
  const years = useMemo(() => Array.from(new Set([...vehicles.map(v => v.year), ...posts.map(p => p.year)].filter((year): year is number => typeof year === 'number'))).sort((a, b) => b - a), [vehicles, posts])
  const myVehicleKeys = useMemo(() => new Set(vehicles.map(vehicle => vehicleCommunityKey(vehicle.year, vehicle.make, vehicle.model))), [vehicles])

  const filterOptions = filterMode === 'make'
    ? makes
    : filterMode === 'model'
      ? models
      : filterMode === 'year'
        ? years.map(String)
        : []
  const allFilterLabel = filterMode === 'make'
    ? 'ALL MAKES'
    : filterMode === 'model'
      ? 'ALL MODELS'
      : filterMode === 'year'
        ? 'ALL YEARS'
        : 'ALL'

  const vehicleScopedPosts = vehicleFilterId
    ? posts.filter(post => linkedBuildVehicleId(post) === vehicleFilterId)
    : posts

  const buildCards = useMemo(() => {
    const groups = new Map<string, CommunityPost[]>()
    vehicleScopedPosts.forEach(post => {
      const vehicleId = linkedBuildVehicleId(post)
      if (!vehicleId) return
      const current = groups.get(vehicleId) || []
      current.push(post)
      groups.set(vehicleId, current)
    })

    return Array.from(groups.entries()).map(([vehicleId, vehiclePosts]) => {
      const sortedPosts = [...vehiclePosts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const latestPost = sortedPosts[0]
      const photoPost = sortedPosts.find(post => (post.buildPhotoKeys || []).length > 0)
      const snapshot = latestPost?.vehicleSnapshot || sortedPosts.find(post => post.vehicleSnapshot)?.vehicleSnapshot
      const buildPhotoKey = photoPost?.buildPhotoKeys?.[0]
      const coverPhotoKey = snapshot?.coverPhotoKey
      const allPublic = sortedPosts.every(post => post.visibility === 'public')
      const allMembers = sortedPosts.every(post => post.visibility !== 'public')
      return {
        vehicleId,
        posts: sortedPosts,
        latestPost,
        snapshot,
        imageUrl: buildPhotoKey ? buildPhotoUrl(buildPhotoKey) : coverPhotoKey ? photoUrl(coverPhotoKey) : '',
        imageSource: buildPhotoKey ? 'build' : coverPhotoKey ? 'cover' : 'none',
        title: vehicleSnapshotTitle(snapshot) || 'Untitled build',
        owner: latestPost ? authorName(latestPost) : 'Community member',
        postCount: sortedPosts.length,
        appreciationCount: sortedPosts.reduce((sum, post) => sum + (post.appreciateCount || 0), 0),
        latestTitle: latestPost?.title || 'Build update',
        visibilityLabel: allPublic ? 'PUBLIC' : allMembers ? 'MEMBERS ONLY' : 'MIXED VISIBILITY',
      }
    }).sort((a, b) => {
      const aTime = new Date(a.latestPost?.createdAt || 0).getTime()
      const bTime = new Date(b.latestPost?.createdAt || 0).getTime()
      return bTime - aTime
    })
  }, [vehicleScopedPosts])

  const filteredPosts = vehicleScopedPosts
    .filter(post => {
      if (filterMode === 'all') return true
      if (filterMode === 'builds') return Boolean(linkedBuildVehicleId(post))
      if (filterMode === 'my_vehicles') return post.vehicleId ? vehicles.some(vehicle => vehicle.id === post.vehicleId) : myVehicleKeys.has(vehicleCommunityKey(post.year, post.make, post.model))
      if (filterMode === 'make') return !filterValue || post.make === filterValue
      if (filterMode === 'model') return !filterValue || post.model === filterValue
      if (filterMode === 'year') return !filterValue || String(post.year) === filterValue
      return true
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  async function handleSubmitPost() {
    if (!currentUser) {
      requireSignIn()
      return
    }
    if (!form.title.trim() || !form.body.trim() || publishingPost) return
    const submittedForm = {
      title: form.title.trim(),
      body: form.body.trim(),
      type: form.type,
      visibility: form.visibility,
      vehicleId: form.vehicleId || undefined,
    }
    const linkedVehicle = vehicles.find(vehicle => vehicle.id === submittedForm.vehicleId)
    const vehiclePreview = linkedVehicle ? getVehiclePreview(linkedVehicle) : null
    const tempId = `${TEMP_ID_PREFIX}post-${Date.now()}`
    const optimisticPost: UiPost = {
      id: tempId,
      ownerId: currentUser.id,
      ownerUsername: currentUser.username,
      ownerDisplayName: currentUser.displayName,
      title: submittedForm.title,
      body: submittedForm.body,
      type: submittedForm.type,
      visibility: submittedForm.visibility,
      vehicleId: linkedVehicle?.id,
      buildVehicleId: linkedVehicle?.id,
      buildPhotoKeys: [],
      vehicleSnapshot: linkedVehicle ? {
        year: linkedVehicle.year,
        make: linkedVehicle.make,
        model: linkedVehicle.model,
        trim: linkedVehicle.trim,
        mileage: linkedVehicle.mileage,
        coverPhotoKey: linkedVehicle.coverPhotoKey || linkedVehicle.photoKeys?.[0],
        estimatedValue: vehiclePreview?.estimatedMarketValue ?? undefined,
        marketConfidence: vehiclePreview?.marketConfidence as CommunityVehicleSnapshot['marketConfidence'],
        proofFiles: vehiclePreview?.proofCount,
        conditionReadiness: vehiclePreview?.conditionReadiness,
      } : undefined,
      make: linkedVehicle?.make,
      model: linkedVehicle?.model,
      year: linkedVehicle?.year,
      appreciateUserIds: [],
      appreciateCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      saveStatus: 'saving',
    }
    setPublishingPost(true)
    setErrorMessage('')
    setPosts(current => [optimisticPost, ...current])
    setForm({ title: '', body: '', type: 'build_update', visibility: 'public', vehicleId: '' })
    try {
      const post = await createCommunityPost(submittedForm)
      setPosts(current => current.map(item => item.id === tempId ? { ...post, saveStatus: 'synced' } : item))
      refreshCommunityFeed({ showStatus: true })
    } catch {
      setPosts(current => current.filter(item => item.id !== tempId))
      setForm({ title: submittedForm.title, body: submittedForm.body, type: submittedForm.type, visibility: submittedForm.visibility, vehicleId: submittedForm.vehicleId || '' })
      setErrorMessage('Could not publish post. Your draft was restored.')
    } finally {
      setPublishingPost(false)
    }
  }

  async function togglePostAppreciation(postId: string) {
    if (!currentUser) {
      requireSignIn()
      return
    }
    if (isOptimisticId(postId)) return
    const previousPosts = posts
    const target = posts.find(post => post.id === postId)
    if (!target) return
    const wasAppreciated = target.appreciateUserIds.includes(currentUser.id)
    const optimisticUserIds = wasAppreciated
      ? target.appreciateUserIds.filter(id => id !== currentUser.id)
      : [...target.appreciateUserIds, currentUser.id]
    setPendingPostAppreciationId(postId)
    setErrorMessage('')
    setPosts(items => items.map(post => post.id === postId ? {
      ...post,
      appreciateUserIds: optimisticUserIds,
      appreciateCount: optimisticUserIds.length,
      saveStatus: 'saving',
    } : post))
    try {
      const updated = await toggleCommunityPostAppreciation(postId)
      setPosts(items => items.map(post => post.id === postId ? { ...updated, saveStatus: 'synced' } : post))
      refreshCommunityFeed({ showStatus: true })
    } catch {
      setPosts(previousPosts)
      setErrorMessage('Could not save appreciation. Your change was rolled back.')
    } finally {
      setPendingPostAppreciationId(null)
    }
  }

  async function addComment(postId: string, parentId?: string) {
    if (!currentUser) {
      requireSignIn()
      return
    }
    if (isOptimisticId(postId)) return
    const body = parentId ? replyBody.trim() : (newCommentBody[postId] || '').trim()
    if (!body) return
    const previousComments = comments
    const previousPosts = posts
    const tempId = `${TEMP_ID_PREFIX}comment-${Date.now()}`
    const optimisticComment: UiComment = {
      id: tempId,
      postId,
      parentId,
      ownerId: currentUser.id,
      ownerUsername: currentUser.username,
      ownerDisplayName: currentUser.displayName,
      body,
      appreciateUserIds: [],
      appreciateCount: 0,
      createdAt: new Date().toISOString(),
      saveStatus: 'saving',
    }
    setErrorMessage('')
    setPendingCommentPostId(postId)
    setComments(current => [...current, optimisticComment])
    setPosts(current => current.map(post => post.id === postId ? { ...post, commentCount: (post.commentCount || 0) + 1, saveStatus: 'saving' } : post))
    if (parentId) {
      setReplyTarget(null)
      setReplyBody('')
    } else {
      setNewCommentBody(current => ({ ...current, [postId]: '' }))
    }
    try {
      const result = await createCommunityComment({ postId, parentId, body })
      setComments(current => current.map(comment => comment.id === tempId ? { ...result.comment, saveStatus: 'synced' } : comment))
      setPosts(current => current.map(post => post.id === postId ? { ...result.post, saveStatus: 'synced' } : post))
      refreshCommunityFeed({ showStatus: true })
    } catch {
      setComments(previousComments)
      setPosts(previousPosts)
      if (parentId) {
        setReplyTarget(parentId)
        setReplyBody(body)
      } else {
        setNewCommentBody(current => ({ ...current, [postId]: body }))
      }
      setErrorMessage('Could not publish comment. Your text was restored.')
    } finally {
      setPendingCommentPostId(null)
    }
  }

  async function toggleCommentAppreciation(commentId: string) {
    if (!currentUser) {
      requireSignIn()
      return
    }
    if (isOptimisticId(commentId)) return
    const previousComments = comments
    const target = comments.find(comment => comment.id === commentId)
    if (!target) return
    const wasAppreciated = target.appreciateUserIds.includes(currentUser.id)
    const optimisticUserIds = wasAppreciated
      ? target.appreciateUserIds.filter(id => id !== currentUser.id)
      : [...target.appreciateUserIds, currentUser.id]
    setPendingCommentAppreciationId(commentId)
    setErrorMessage('')
    setComments(current => current.map(comment => comment.id === commentId ? {
      ...comment,
      appreciateUserIds: optimisticUserIds,
      appreciateCount: optimisticUserIds.length,
      saveStatus: 'saving',
    } : comment))
    try {
      const updated = await toggleCommunityCommentAppreciation(commentId)
      setComments(current => current.map(comment => comment.id === commentId ? { ...updated, saveStatus: 'synced' } : comment))
      refreshCommunityFeed({ showStatus: true })
    } catch {
      setComments(previousComments)
      setErrorMessage('Could not save appreciation. Your change was rolled back.')
    } finally {
      setPendingCommentAppreciationId(null)
    }
  }

  async function removePost(postId: string) {
    setPendingDeleteId(postId)
    setErrorMessage('')
    try {
      await deleteCommunityPost(postId)
      setPosts(current => current.filter(post => post.id !== postId))
      setComments(current => current.filter(comment => comment.postId !== postId))
      await refreshCommunityFeed({ showStatus: true })
    } catch {
      setErrorMessage('Could not delete post.')
    } finally {
      setPendingDeleteId(null)
    }
  }

  async function removeComment(commentId: string) {
    setPendingDeleteId(commentId)
    setErrorMessage('')
    try {
      const result = await deleteCommunityComment(commentId)
      setComments(current => current.filter(comment => !result.deletedIds.includes(comment.id)))
      setPosts(current => current.map(post => post.id === result.post.id ? result.post : post))
      await refreshCommunityFeed({ showStatus: true })
    } catch {
      setErrorMessage('Could not delete comment.')
    } finally {
      setPendingDeleteId(null)
    }
  }

  const inputStyle: CSSProperties = {
    background: '#111110',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--off-white)',
    padding: '11px 13px',
    width: '100%',
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 14,
    outline: 'none',
  }
  const labelStyle: CSSProperties = {
    fontFamily: 'DM Mono, monospace',
    fontSize: 10,
    color: 'var(--gray)',
    letterSpacing: '0.1em',
    display: 'block',
    marginBottom: 6,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px' }}>
        <div className="fade-up" style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>
            -- COMMUNITY
          </div>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(36px,6vw,60px)', color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.03em' }}>
            COMMUNITY
          </h1>
          <p style={{ color: 'var(--gray)', fontSize: 14, marginTop: 6 }}>
            Proof-backed car discussion tied to builds, comps, and real ownership.
          </p>
          <p style={{ color: 'var(--gray)', fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
            Posts can live in multiple communities at once: make, model, year, and linked vehicle.
          </p>
        </div>

        <>
            {!currentUser && !loading ? (
              <div className="fade-up delay-1" style={{ background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.24)', borderRadius: 8, padding: '16px 18px', marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.06em' }}>
                  Sign in to post, comment, or appreciate.
                </div>
                <Link href="/app/login" style={{ background: 'var(--accent)', color: 'var(--black)', borderRadius: 4, padding: '8px 12px', textDecoration: 'none', fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>
                  SIGN IN
                </Link>
              </div>
            ) : currentUser ? (
              <div className="fade-up delay-1" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px', marginBottom: 22 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: 'var(--off-white)', letterSpacing: '0.03em', marginBottom: 16 }}>
                CREATE POST
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>TITLE</label>
                  <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} placeholder="What are you working through?" />
                </div>
                <div>
                  <label style={labelStyle}>POST TYPE</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as CommunityPostType }))} style={inputStyle}>
                    <option value="build_update">BUILD UPDATE</option>
                    <option value="question">QUESTION</option>
                    <option value="valuation_check">VALUATION CHECK</option>
                    <option value="showcase">SHOWCASE</option>
                    <option value="proof_drop">PROOF DROP</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>VISIBILITY</label>
                  <select value={form.visibility} onChange={e => setForm(p => ({ ...p, visibility: e.target.value as CommunityPostVisibility }))} style={inputStyle}>
                    <option value="public">Public</option>
                    <option value="members">Members only</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>OPTIONAL VEHICLE</label>
                  <select value={form.vehicleId} onChange={e => setForm(p => ({ ...p, vehicleId: e.target.value }))} style={inputStyle}>
                    <option value="">Community post</option>
                    {vehicles.map(vehicle => (
                      <option key={vehicle.id} value={vehicle.id}>{vehicle.year} {vehicle.make} {vehicle.model}</option>
                    ))}
                  </select>
                </div>
                {selectedVehicle && (
                  <div style={{ display: 'flex', alignItems: 'end', gap: 6, flexWrap: 'wrap' }}>
                    {[selectedVehicle.year, selectedVehicle.make, selectedVehicle.model].map(value => (
                      <span key={String(value)} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', border: '1px solid rgba(0,232,122,0.3)', borderRadius: 999, padding: '5px 8px', letterSpacing: '0.06em' }}>
                        {value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <label style={labelStyle}>BODY</label>
              <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} style={{ ...inputStyle, minHeight: 110, resize: 'vertical', marginBottom: 12 }} placeholder="Share the detail, proof, comp question, or build update..." />
              <button onClick={handleSubmitPost} disabled={!form.title.trim() || !form.body.trim() || publishingPost} style={{ background: 'var(--accent)', border: 'none', color: 'var(--black)', cursor: form.title.trim() && form.body.trim() && !publishingPost ? 'pointer' : 'not-allowed', opacity: form.title.trim() && form.body.trim() && !publishingPost ? 1 : 0.5, fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '10px 16px', borderRadius: 4 }}>
                {publishingPost ? 'Posting...' : 'SUBMIT POST'}
              </button>
            </div>
            ) : null}

            {errorMessage && (
              <div style={{ background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.24)', color: '#ffb3b3', borderRadius: 6, padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.06em', marginBottom: 12 }}>
                {errorMessage}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: liveStatus === 'Refreshing...' ? 'var(--accent)' : 'var(--gray)', letterSpacing: '0.08em' }}>
                {liveStatus}
              </div>
            </div>

            <div className="fade-up delay-2" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, alignItems: 'center', marginBottom: 8 }}>
              {[
                { label: 'ALL POSTS', value: 'all' as FilterMode },
                { label: 'BUILDS', value: 'builds' as FilterMode },
                { label: 'MY VEHICLES', value: 'my_vehicles' as FilterMode },
                { label: 'MAKE COMMUNITIES', value: 'make' as FilterMode },
                { label: 'MODEL COMMUNITIES', value: 'model' as FilterMode },
                { label: 'YEAR COMMUNITIES', value: 'year' as FilterMode },
              ].map(filter => (
                <button key={filter.value} onClick={() => { setFilterMode(filter.value); setFilterValue('') }} style={{ flexShrink: 0, background: filterMode === filter.value ? 'rgba(0,232,122,0.1)' : 'transparent', border: `1px solid ${filterMode === filter.value ? 'rgba(0,232,122,0.35)' : 'var(--border)'}`, color: filterMode === filter.value ? '#00e87a' : 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '8px 10px', borderRadius: 999, cursor: 'pointer', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {filter.label}
                </button>
              ))}
            </div>
            {filterOptions.length > 0 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
                <button onClick={() => setFilterValue('')} style={{ flexShrink: 0, background: filterValue === '' ? 'rgba(0,232,122,0.1)' : 'transparent', border: `1px solid ${filterValue === '' ? 'rgba(0,232,122,0.35)' : 'var(--border)'}`, color: filterValue === '' ? '#00e87a' : 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '7px 10px', borderRadius: 999, cursor: 'pointer', letterSpacing: '0.05em' }}>
                  {allFilterLabel}
                </button>
                {filterOptions.map(option => (
                  <button key={option} onClick={() => setFilterValue(option)} style={{ flexShrink: 0, background: filterValue === option ? 'rgba(0,232,122,0.1)' : 'transparent', border: `1px solid ${filterValue === option ? 'rgba(0,232,122,0.35)' : 'var(--border)'}`, color: filterValue === option ? '#00e87a' : 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '7px 10px', borderRadius: 999, cursor: 'pointer', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    {option}
                  </button>
                ))}
              </div>
            )}
            {vehicleFilterId && (
              <div style={{ background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.2)', color: 'var(--gray-light)', borderRadius: 6, padding: '9px 11px', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.06em', marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span>SHOWING BUILD THREAD FOR LINKED VEHICLE</span>
                <Link href="/app/community" style={{ color: 'var(--accent)', textDecoration: 'none' }}>CLEAR FILTER</Link>
              </div>
            )}

            {loading ? (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '34px 20px', textAlign: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.08em' }}>
                LOADING COMMUNITY...
              </div>
            ) : filterMode === 'builds' ? (
              buildCards.length === 0 ? (
                <div style={{ background: 'rgba(0,232,122,0.055)', border: '1px solid rgba(0,232,122,0.22)', borderRadius: 8, padding: '34px 20px', textAlign: 'center', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 12, lineHeight: 1.6, letterSpacing: '0.08em' }}>
                  No public builds yet. Start a proof-backed build profile from your garage.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(280px,100%),1fr))', gap: 14 }}>
                  {buildCards.map(card => (
                    <Link key={card.vehicleId} href={`/builds/${encodeURIComponent(card.vehicleId)}`} style={{ display: 'block', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#0e0e0d' }}>
                        {card.imageUrl ? (
                          <img src={card.imageUrl} alt={card.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.1em' }}>
                            BUILD
                          </div>
                        )}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 42%, rgba(0,0,0,0.82) 100%)' }} />
                        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-end' }}>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em' }}>
                            {card.imageSource === 'build' ? 'LATEST BUILD PHOTO' : card.imageSource === 'cover' ? 'VEHICLE COVER' : 'PROOF BUILD'}
                          </div>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: card.visibilityLabel === 'PUBLIC' ? '#00e87a' : 'var(--gray-light)', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(10,10,9,0.72)', borderRadius: 999, padding: '4px 7px', whiteSpace: 'nowrap' }}>
                            {card.visibilityLabel}
                          </div>
                        </div>
                      </div>
                      <div style={{ padding: '14px 15px 15px' }}>
                        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, color: 'var(--off-white)', lineHeight: 1, letterSpacing: '0.03em', marginBottom: 7 }}>
                          {card.title}
                        </div>
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.06em', marginBottom: 12 }}>
                          {card.owner}
                        </div>
                        <div style={{ color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.45, marginBottom: 14 }}>
                          {card.latestTitle}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '8px 9px', background: 'rgba(255,255,255,0.025)' }}>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 4 }}>BUILD POSTS</div>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--off-white)' }}>{card.postCount}</div>
                          </div>
                          <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '8px 9px', background: 'rgba(255,255,255,0.025)' }}>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 4 }}>APPRECIATIONS</div>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: '#00e87a' }}>{card.appreciationCount}</div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            ) : filteredPosts.length === 0 ? (
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '34px 20px', textAlign: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.08em' }}>
                {posts.length === 0 ? 'No posts yet. Start the first proof-backed discussion.' : 'No posts in this community yet.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filteredPosts.map(post => {
                  const linkedVehicle = vehicles.find(vehicle => vehicle.id === post.vehicleId)
                  const linkedVehiclePreview = linkedVehicle ? getVehiclePreview(linkedVehicle) : null
                  const snapshot = post.vehicleSnapshot
                  const imageUrl = linkedVehiclePreview?.imageUrl || (snapshot?.coverPhotoKey ? photoUrl(snapshot.coverPhotoKey) : null)
                  const appreciated = !!currentUser && post.appreciateUserIds.includes(currentUser.id)
                  const canDelete = !!currentUser && post.ownerId === currentUser.id
                  const vehicleTitle = [snapshot?.year, snapshot?.make, snapshot?.model].filter(Boolean).join(' ')
                  return (
                    <article key={post.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                        <div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', border: '1px solid rgba(0,232,122,0.3)', background: 'rgba(0,232,122,0.08)', borderRadius: 3, padding: '3px 7px', letterSpacing: '0.1em' }}>
                              {postTypeLabels[post.type]}
                            </span>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: post.visibility === 'public' ? '#00e87a' : 'var(--gray)', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 7px', letterSpacing: '0.1em' }}>
                              {visibilityLabel(post.visibility)}
                            </span>
                            {[post.year, post.make, post.model].filter(Boolean).map(value => (
                              <span key={String(value)} style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 7px', letterSpacing: '0.06em' }}>
                                {value}
                              </span>
                            ))}
                          </div>
                          <h2 style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 18, color: 'var(--off-white)', lineHeight: 1.25, marginBottom: 8 }}>
                            {post.title}
                          </h2>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.06em' }}>
                            {authorName(post)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.06em' }}>
                            {post.saveStatus === 'saving' ? 'Posting...' : new Date(post.createdAt).toLocaleString()}
                          </div>
                          {post.saveStatus === 'synced' && (
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.06em' }}>
                              Updated just now
                            </div>
                          )}
                          {canDelete && (
                            <button onClick={() => removePost(post.id)} disabled={pendingDeleteId === post.id} style={{ background: 'transparent', border: 'none', color: '#ff7a7a', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: 0 }}>
                              DELETE
                            </button>
                          )}
                        </div>
                      </div>
                      <p style={{ color: 'var(--gray-light)', fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
                        {bodyPreview(post.body)}
                      </p>
                      {post.buildPhotoKeys && post.buildPhotoKeys.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(post.buildPhotoKeys.length, 3)}, minmax(0, 1fr))`, gap: 8, marginBottom: 12 }}>
                          {post.buildPhotoKeys.slice(0, 6).map((key, index) => (
                            <div key={key} style={{ aspectRatio: post.buildPhotoKeys!.length === 1 ? '16 / 9' : '4 / 3', borderRadius: 6, overflow: 'hidden', background: '#0e0e0d', border: '1px solid var(--border)' }}>
                              <img src={buildPhotoUrl(key)} alt={`Build photo ${index + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            </div>
                          ))}
                        </div>
                      )}
                      {snapshot && (
                        <div style={{ display: 'grid', gridTemplateColumns: imageUrl ? '96px 1fr' : '1fr', gap: 12, alignItems: 'stretch', background: '#0e0e0d', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--off-white)', textDecoration: 'none', padding: 10, marginBottom: 12 }}>
                          {imageUrl && (
                            <div style={{ width: 96, minHeight: 72, borderRadius: 4, overflow: 'hidden', background: '#151513' }}>
                              <img src={imageUrl} alt={vehicleTitle || 'Linked vehicle'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 4 }}>
                              LINKED VEHICLE
                            </div>
                            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--off-white)', fontWeight: 600, marginBottom: 8 }}>
                              {linkedVehicle ? <Link href={`/app/vehicles/${linkedVehicle.id}`} style={{ color: 'var(--off-white)', textDecoration: 'none' }}>{vehicleTitle}</Link> : vehicleTitle}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8 }}>
                              {[
                                { label: 'VALUE', value: snapshot.estimatedValue == null ? 'NO DATA' : formatCurrency(snapshot.estimatedValue) },
                                { label: 'CONFIDENCE', value: snapshot.marketConfidence || 'NO DATA' },
                                { label: 'PROOF FILES', value: snapshot.proofFiles ?? 0 },
                                { label: 'CONDITION', value: snapshot.conditionReadiness || 'NO DATA' },
                              ].map(stat => (
                                <div key={stat.label}>
                                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 2 }}>{stat.label}</div>
                                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: stat.value === 'HIGH' || stat.value === 'STRONG' ? '#00e87a' : 'var(--gray-light)' }}>{stat.value}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                        <button onClick={() => togglePostAppreciation(post.id)} disabled={pendingPostAppreciationId === post.id || post.saveStatus === 'saving'} style={{ background: appreciated ? 'rgba(0,232,122,0.12)' : 'transparent', border: `1px solid ${appreciated ? 'rgba(0,232,122,0.4)' : 'var(--border)'}`, color: appreciated ? '#00e87a' : 'var(--gray-light)', cursor: currentUser && post.saveStatus !== 'saving' ? 'pointer' : 'not-allowed', borderRadius: 4, fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: '7px 10px' }}>
                          {pendingPostAppreciationId === post.id ? 'Saving...' : appreciated ? 'APPRECIATED' : 'APPRECIATE'}
                        </button>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: appreciated ? '#00e87a' : 'var(--gray)' }}>
                          {post.appreciateCount} Appreciation{post.appreciateCount === 1 ? '' : 's'}
                        </span>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)' }}>
                          {post.commentCount} COMMENT{post.commentCount === 1 ? '' : 'S'}
                        </span>
                      </div>
                      <div style={{ marginTop: 14 }}>
                        {currentUser ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
                            <textarea value={newCommentBody[post.id] || ''} onChange={e => setNewCommentBody(current => ({ ...current, [post.id]: e.target.value }))} placeholder="Add a comment..." style={{ ...inputStyle, minHeight: 64, resize: 'vertical', fontSize: 13 }} />
                            <button onClick={() => addComment(post.id)} disabled={!(newCommentBody[post.id] || '').trim() || pendingCommentPostId === post.id || post.saveStatus === 'saving'} style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', cursor: (newCommentBody[post.id] || '').trim() && pendingCommentPostId !== post.id && post.saveStatus !== 'saving' ? 'pointer' : 'not-allowed', opacity: (newCommentBody[post.id] || '').trim() ? 1 : 0.5, fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.06em', padding: '9px 10px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                              {pendingCommentPostId === post.id ? 'Commenting...' : 'COMMENT'}
                            </button>
                          </div>
                        ) : (
                          <button onClick={requireSignIn} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--gray-light)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: '8px 10px', borderRadius: 4, marginBottom: 10 }}>
                            SIGN IN TO COMMENT
                          </button>
                        )}
                        <CommentThread
                          comments={comments}
                          postId={post.id}
                          currentUser={currentUser}
                          replyTarget={replyTarget}
                          replyBody={replyBody}
                          pendingAppreciationId={pendingCommentAppreciationId}
                          pendingDeleteId={pendingDeleteId}
                          pendingCommentPostId={pendingCommentPostId}
                          onStartReply={(commentId) => {
                            if (!currentUser) {
                              requireSignIn()
                              return
                            }
                            setReplyTarget(commentId)
                            setReplyBody('')
                          }}
                          onReplyBodyChange={setReplyBody}
                          onSubmitReply={addComment}
                          onToggleAppreciation={toggleCommentAppreciation}
                          onDeleteComment={removeComment}
                        />
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </>
      </div>
    </div>
  )
}

export default function CommunityPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--black)' }} />}>
      <CommunityPageContent />
    </Suspense>
  )
}
