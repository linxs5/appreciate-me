'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getVehicles, photoUrl } from '@/lib/api'
import type { CommunityComment, CommunityPost, Vehicle } from '@/lib/types'

const postTypeLabels: Record<CommunityPost['type'], string> = {
  build_update: 'BUILD UPDATE',
  question: 'QUESTION',
  showcase: 'SHOWCASE',
  valuation: 'VALUATION DISCUSSION',
}

type FilterMode = 'all' | 'my_vehicles' | 'make' | 'model' | 'year'

function createId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

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
  const marketConfidence = soldCompCount >= 5 ? 'HIGH' : soldCompCount >= 2 ? 'MEDIUM' : marketComps.length > 0 ? 'LOW' : '—'
  const proofCount = vehicle.entries.reduce((sum, entry) => sum + (entry.attachments?.length || 0), 0)
  return {
    coverPhotoKey: vehicle.coverPhotoKey || vehicle.photoKeys?.[0],
    estimatedMarketValue,
    marketConfidence,
    proofCount,
    logCount: vehicle.entries.length,
  }
}

function CommentThread({
  comments,
  postId,
  parentId,
  depth = 0,
  replyTarget,
  replyBody,
  onStartReply,
  onReplyBodyChange,
  onSubmitReply,
}: {
  comments: CommunityComment[]
  postId: string
  parentId?: string
  depth?: number
  replyTarget: string | null
  replyBody: string
  onStartReply: (commentId: string) => void
  onReplyBodyChange: (value: string) => void
  onSubmitReply: (postId: string, parentId?: string) => void
}) {
  const children = comments
    .filter(comment => comment.postId === postId && comment.parentId === parentId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  if (children.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginLeft: depth > 0 ? 14 : 0 }}>
      {children.map(comment => (
        <div key={comment.id} style={{ borderLeft: depth > 0 ? '1px solid var(--border)' : 'none', paddingLeft: depth > 0 ? 12 : 0 }}>
          <div style={{ background: '#0e0e0d', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>{comment.body}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--gray)', letterSpacing: '0.06em' }}>
                {new Date(comment.createdAt).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => onStartReply(comment.id)}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: 0 }}
              >
                REPLY
              </button>
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
                  POST REPLY
                </button>
              </div>
            )}
          </div>
          <CommentThread
            comments={comments}
            postId={postId}
            parentId={comment.id}
            depth={depth + 1}
            replyTarget={replyTarget}
            replyBody={replyBody}
            onStartReply={onStartReply}
            onReplyBodyChange={onReplyBodyChange}
            onSubmitReply={onSubmitReply}
          />
        </div>
      ))}
    </div>
  )
}

export default function CommunityPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [appreciatedPostIds, setAppreciatedPostIds] = useState<Set<string>>(new Set())
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [filterValue, setFilterValue] = useState('')
  const [replyTarget, setReplyTarget] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [newCommentBody, setNewCommentBody] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    title: '',
    body: '',
    type: 'build_update' as CommunityPost['type'],
    vehicleId: '',
  })

  useEffect(() => {
    getVehicles().then(setVehicles)
  }, [])

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

  const filteredPosts = posts
    .filter(post => {
      if (filterMode === 'all') return true
      if (filterMode === 'my_vehicles') return post.vehicleId ? vehicles.some(vehicle => vehicle.id === post.vehicleId) : myVehicleKeys.has(vehicleCommunityKey(post.year, post.make, post.model))
      if (filterMode === 'make') return !filterValue || post.make === filterValue
      if (filterMode === 'model') return !filterValue || post.model === filterValue
      if (filterMode === 'year') return !filterValue || String(post.year) === filterValue
      return true
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  function handleSubmitPost() {
    if (!form.title.trim() || !form.body.trim()) return
    const vehicle = vehicles.find(item => item.id === form.vehicleId)
    const post: CommunityPost = {
      id: createId(),
      title: form.title.trim(),
      body: form.body.trim(),
      type: form.type,
      vehicleId: vehicle?.id,
      make: vehicle?.make,
      model: vehicle?.model,
      year: vehicle?.year,
      createdAt: new Date().toISOString(),
      appreciateCount: 0,
      commentCount: 0,
    }
    setPosts(current => [post, ...current])
    setForm({ title: '', body: '', type: 'build_update', vehicleId: '' })
  }

  function toggleAppreciate(postId: string) {
    setAppreciatedPostIds(current => {
      const next = new Set(current)
      const active = next.has(postId)
      if (active) next.delete(postId)
      else next.add(postId)
      setPosts(items => items.map(post => post.id === postId ? { ...post, appreciateCount: Math.max(0, post.appreciateCount + (active ? -1 : 1)) } : post))
      return next
    })
  }

  function addComment(postId: string, parentId?: string) {
    const body = parentId ? replyBody.trim() : (newCommentBody[postId] || '').trim()
    if (!body) return
    const comment: CommunityComment = {
      id: createId(),
      postId,
      parentId,
      body,
      createdAt: new Date().toISOString(),
    }
    setComments(current => [...current, comment])
    setPosts(current => current.map(post => post.id === postId ? { ...post, commentCount: post.commentCount + 1 } : post))
    if (parentId) {
      setReplyTarget(null)
      setReplyBody('')
    } else {
      setNewCommentBody(current => ({ ...current, [postId]: '' }))
    }
  }

  const inputStyle: React.CSSProperties = {
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
  const labelStyle: React.CSSProperties = {
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
            — COMMUNITY
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
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as CommunityPost['type'] }))} style={inputStyle}>
                <option value="build_update">BUILD UPDATE</option>
                <option value="question">QUESTION</option>
                <option value="showcase">SHOWCASE</option>
                <option value="valuation">VALUATION DISCUSSION</option>
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
          <button onClick={handleSubmitPost} disabled={!form.title.trim() || !form.body.trim()} style={{ background: 'var(--accent)', border: 'none', color: 'var(--black)', cursor: form.title.trim() && form.body.trim() ? 'pointer' : 'not-allowed', opacity: form.title.trim() && form.body.trim() ? 1 : 0.5, fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '10px 16px', borderRadius: 4 }}>
            SUBMIT POST
          </button>
        </div>

        <div className="fade-up delay-2" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, alignItems: 'center', marginBottom: 8 }}>
          {[
            { label: 'ALL POSTS', value: 'all' as FilterMode },
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

        {filteredPosts.length === 0 ? (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '34px 20px', textAlign: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.08em' }}>
            NO POSTS YET
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredPosts.map(post => {
              const linkedVehicle = vehicles.find(vehicle => vehicle.id === post.vehicleId)
              const linkedVehiclePreview = linkedVehicle ? getVehiclePreview(linkedVehicle) : null
              const appreciated = appreciatedPostIds.has(post.id)
              return (
                <article key={post.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', border: '1px solid rgba(0,232,122,0.3)', background: 'rgba(0,232,122,0.08)', borderRadius: 3, padding: '3px 7px', letterSpacing: '0.1em' }}>
                          {postTypeLabels[post.type]}
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
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.06em' }}>
                      {new Date(post.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <p style={{ color: 'var(--gray-light)', fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
                    {bodyPreview(post.body)}
                  </p>
                  {linkedVehicle && linkedVehiclePreview && (
                    <Link href={`/app/vehicles/${linkedVehicle.id}`} style={{ display: 'grid', gridTemplateColumns: linkedVehiclePreview.coverPhotoKey ? '96px 1fr' : '1fr', gap: 12, alignItems: 'stretch', background: '#0e0e0d', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--off-white)', textDecoration: 'none', padding: 10, marginBottom: 12 }}>
                      {linkedVehiclePreview.coverPhotoKey && (
                        <div style={{ width: 96, minHeight: 72, borderRadius: 4, overflow: 'hidden', background: '#151513' }}>
                          <img src={photoUrl(linkedVehiclePreview.coverPhotoKey)} alt={`${linkedVehicle.year} ${linkedVehicle.make} ${linkedVehicle.model}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        </div>
                      )}
                      <div>
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 4 }}>
                          LINKED VEHICLE
                        </div>
                        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--off-white)', fontWeight: 600, marginBottom: 8 }}>
                          {linkedVehicle.year} {linkedVehicle.make} {linkedVehicle.model}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8 }}>
                          {[
                            { label: 'VALUE', value: linkedVehiclePreview.estimatedMarketValue == null ? 'NO DATA' : formatCurrency(linkedVehiclePreview.estimatedMarketValue) },
                            { label: 'CONFIDENCE', value: linkedVehiclePreview.marketConfidence },
                            { label: 'PROOF FILES', value: linkedVehiclePreview.proofCount },
                            { label: 'LOG RECORDS', value: linkedVehiclePreview.logCount },
                          ].map(stat => (
                            <div key={stat.label}>
                              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 2 }}>{stat.label}</div>
                              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: stat.label === 'CONFIDENCE' && stat.value === 'HIGH' ? '#00e87a' : 'var(--gray-light)' }}>{stat.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Link>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                    <button onClick={() => toggleAppreciate(post.id)} style={{ background: appreciated ? 'rgba(0,232,122,0.12)' : 'transparent', border: `1px solid ${appreciated ? 'rgba(0,232,122,0.4)' : 'var(--border)'}`, color: appreciated ? '#00e87a' : 'var(--gray-light)', cursor: 'pointer', borderRadius: 4, fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', padding: '7px 10px' }}>
                      APPRECIATE
                    </button>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: appreciated ? '#00e87a' : 'var(--gray)' }}>
                      {post.appreciateCount} APPRECIATION{post.appreciateCount === 1 ? '' : 'S'}
                    </span>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)' }}>
                      {post.commentCount} COMMENT{post.commentCount === 1 ? '' : 'S'}
                    </span>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
                      <textarea value={newCommentBody[post.id] || ''} onChange={e => setNewCommentBody(current => ({ ...current, [post.id]: e.target.value }))} placeholder="Add a comment..." style={{ ...inputStyle, minHeight: 64, resize: 'vertical', fontSize: 13 }} />
                      <button onClick={() => addComment(post.id)} disabled={!(newCommentBody[post.id] || '').trim()} style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', cursor: (newCommentBody[post.id] || '').trim() ? 'pointer' : 'not-allowed', opacity: (newCommentBody[post.id] || '').trim() ? 1 : 0.5, fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.06em', padding: '9px 10px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                        COMMENT
                      </button>
                    </div>
                    <CommentThread
                      comments={comments}
                      postId={post.id}
                      replyTarget={replyTarget}
                      replyBody={replyBody}
                      onStartReply={(commentId) => { setReplyTarget(commentId); setReplyBody('') }}
                      onReplyBodyChange={setReplyBody}
                      onSubmitReply={addComment}
                    />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
