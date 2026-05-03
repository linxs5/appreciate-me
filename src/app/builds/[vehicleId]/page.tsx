'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  buildPhotoUrl,
  getCommunityComments,
  getCommunityPosts,
  getPublicVehicle,
  photoUrl,
} from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import type { CommunityComment, CommunityPost, CommunityPostType, UserProfile, Vehicle } from '@/lib/types'

const postTypeLabels: Record<CommunityPostType, string> = {
  build_update: 'BUILD UPDATE',
  question: 'QUESTION',
  valuation_check: 'VALUATION CHECK',
  showcase: 'SHOWCASE',
  proof_drop: 'PROOF DROP',
}

function authorName(item?: Pick<CommunityPost | CommunityComment, 'ownerDisplayName' | 'ownerUsername'>) {
  if (!item) return 'Community member'
  return item.ownerDisplayName || (item.ownerUsername ? `@${item.ownerUsername}` : 'Community member')
}

function vehicleTitle(vehicle?: Vehicle | null, snapshot?: CommunityPost['vehicleSnapshot']) {
  return [
    snapshot?.year ?? vehicle?.year,
    snapshot?.make ?? vehicle?.make,
    snapshot?.model ?? vehicle?.model,
    snapshot?.trim ?? vehicle?.trim,
  ].filter(Boolean).join(' ')
}

function visibilityLabel(post: CommunityPost) {
  return post.visibility === 'public' ? 'PUBLIC' : 'MEMBERS ONLY'
}

export default function BuildProfilePage({ params }: { params: { vehicleId: string } }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let mounted = true
    async function loadBuildProfile() {
      setLoading(true)
      setErrorMessage('')
      try {
        const [user, publicVehicle, postData, commentData] = await Promise.all([
          getCurrentUser(),
          getPublicVehicle(params.vehicleId),
          getCommunityPosts(params.vehicleId),
          getCommunityComments(),
        ])
        if (!mounted) return
        setCurrentUser(user)
        setVehicle(publicVehicle)
        setPosts(postData)
        const visiblePostIds = new Set(postData.map(post => post.id))
        setComments(commentData.filter(comment => visiblePostIds.has(comment.postId)))
      } catch {
        if (mounted) setErrorMessage('Could not load this build profile.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    loadBuildProfile()
    return () => { mounted = false }
  }, [params.vehicleId])

  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts]
  )
  const latestPost = sortedPosts[0]
  const snapshot = latestPost?.vehicleSnapshot || sortedPosts.find(post => post.vehicleSnapshot)?.vehicleSnapshot
  const buildPhotoPost = sortedPosts.find(post => (post.buildPhotoKeys || []).length > 0)
  const heroBuildPhotoKey = buildPhotoPost?.buildPhotoKeys?.[0]
  const coverPhotoKey = snapshot?.coverPhotoKey || vehicle?.coverPhotoKey || vehicle?.photoKeys?.[0]
  const heroImageUrl = heroBuildPhotoKey ? buildPhotoUrl(heroBuildPhotoKey) : coverPhotoKey ? photoUrl(coverPhotoKey) : ''
  const title = vehicleTitle(vehicle, snapshot) || 'Public build'
  const owner = authorName(latestPost)
  const totalAppreciations = sortedPosts.reduce((sum, post) => sum + (post.appreciateCount || 0), 0)
  const postComments = (postId: string) => comments
    .filter(comment => comment.postId === postId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  return (
    <div style={{ minHeight: '100vh', background: 'var(--black)', color: 'var(--off-white)' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 24px 46px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <Link href="/app/community" style={{ color: 'var(--accent)', textDecoration: 'none', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.08em' }}>
            BACK TO BUILDS
          </Link>
          <Link href={`/share/${encodeURIComponent(params.vehicleId)}`} style={{ background: 'var(--accent)', color: 'var(--black)', textDecoration: 'none', borderRadius: 4, padding: '9px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>
            VIEW PROOF PACKET
          </Link>
        </div>

        {loading ? (
          <div style={{ border: '1px solid var(--border)', background: 'var(--card-bg)', borderRadius: 8, padding: '34px 20px', textAlign: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.08em' }}>
            LOADING BUILD PROFILE...
          </div>
        ) : errorMessage ? (
          <div style={{ border: '1px solid rgba(255,80,80,0.24)', background: 'rgba(255,80,80,0.08)', borderRadius: 8, padding: '20px', color: '#ffb3b3', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.06em' }}>
            {errorMessage}
          </div>
        ) : (
          <>
            <section style={{ border: '1px solid var(--border)', background: 'var(--card-bg)', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
              <div style={{ position: 'relative', minHeight: 320, background: '#0e0e0d' }}>
                {heroImageUrl ? (
                  <img src={heroImageUrl} alt={title} style={{ width: '100%', height: 'min(58vh, 520px)', minHeight: 320, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)', fontFamily: 'DM Mono, monospace', fontSize: 12, letterSpacing: '0.1em' }}>
                    BUILD PROFILE
                  </div>
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.84) 100%)' }} />
                <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18 }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 8 }}>
                    BUILD IN PUBLIC. PROVE THE WORK.
                  </div>
                  <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(42px,8vw,82px)', color: 'var(--off-white)', lineHeight: 0.95, letterSpacing: '0.03em', marginBottom: 10 }}>
                    {title}
                  </h1>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray-light)', letterSpacing: '0.06em' }}>{owner}</span>
                    {(snapshot?.mileage || vehicle?.mileage) && (
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray-light)', letterSpacing: '0.06em' }}>
                        {(snapshot?.mileage || vehicle?.mileage || 0).toLocaleString()} MI
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 0, borderTop: '1px solid var(--border)' }}>
                {[
                  { label: 'BUILD POSTS', value: String(sortedPosts.length) },
                  { label: 'APPRECIATIONS', value: String(totalAppreciations) },
                  { label: 'PHOTOS', value: String(sortedPosts.reduce((sum, post) => sum + (post.buildPhotoKeys?.length || 0), 0)) },
                ].map(stat => (
                  <div key={stat.label} style={{ padding: '13px 15px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--gray)', letterSpacing: '0.1em', marginBottom: 5 }}>{stat.label}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 15, color: stat.label === 'APPRECIATIONS' ? '#00e87a' : 'var(--off-white)' }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            </section>

            {!currentUser && (
              <div style={{ background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.24)', borderRadius: 8, padding: '15px 16px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ color: 'var(--gray-light)', fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.06em' }}>
                  Sign in to comment, appreciate, or start your own build.
                </div>
                <Link href="/app/login" style={{ background: 'var(--accent)', color: 'var(--black)', borderRadius: 4, padding: '8px 12px', textDecoration: 'none', fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>
                  SIGN IN
                </Link>
              </div>
            )}

            <section>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginBottom: 12 }}>
                BUILD TIMELINE
              </div>
              {sortedPosts.length === 0 ? (
                <div style={{ background: 'rgba(0,232,122,0.055)', border: '1px solid rgba(0,232,122,0.22)', borderRadius: 8, padding: '34px 20px', textAlign: 'center', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 12, lineHeight: 1.6, letterSpacing: '0.08em' }}>
                  This build does not have public updates yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {sortedPosts.map(post => {
                    const visibleComments = postComments(post.id)
                    return (
                      <article key={post.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '17px 18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', border: '1px solid rgba(0,232,122,0.3)', background: 'rgba(0,232,122,0.08)', borderRadius: 3, padding: '3px 7px', letterSpacing: '0.1em' }}>
                              {postTypeLabels[post.type]}
                            </span>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: post.visibility === 'public' ? '#00e87a' : 'var(--gray)', border: '1px solid var(--border)', borderRadius: 3, padding: '3px 7px', letterSpacing: '0.1em' }}>
                              {visibilityLabel(post)}
                            </span>
                          </div>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.06em' }}>
                            {new Date(post.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <h2 style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 20, color: 'var(--off-white)', lineHeight: 1.25, marginBottom: 8 }}>
                          {post.title}
                        </h2>
                        <p style={{ color: 'var(--gray-light)', fontSize: 14, lineHeight: 1.65, marginBottom: 13, whiteSpace: 'pre-wrap' }}>
                          {post.body}
                        </p>
                        {post.buildPhotoKeys && post.buildPhotoKeys.length > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(post.buildPhotoKeys.length, 3)}, minmax(0, 1fr))`, gap: 8, marginBottom: 13 }}>
                            {post.buildPhotoKeys.slice(0, 6).map((key, index) => (
                              <div key={key} style={{ aspectRatio: post.buildPhotoKeys!.length === 1 ? '16 / 9' : '4 / 3', borderRadius: 6, overflow: 'hidden', background: '#0e0e0d', border: '1px solid var(--border)' }}>
                                <img src={buildPhotoUrl(key)} alt={`Build photo ${index + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 11, fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--gray)', letterSpacing: '0.06em' }}>
                          <span>{post.appreciateCount} Appreciation{post.appreciateCount === 1 ? '' : 's'}</span>
                          <span>{visibleComments.length} Comment{visibleComments.length === 1 ? '' : 's'}</span>
                        </div>
                        {visibleComments.length > 0 && (
                          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {visibleComments.slice(0, 4).map(comment => (
                              <div key={comment.id} style={{ background: '#0e0e0d', border: '1px solid var(--border)', borderRadius: 6, padding: '9px 10px' }}>
                                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 5 }}>
                                  {authorName(comment)}
                                </div>
                                <div style={{ color: 'var(--gray-light)', fontSize: 13, lineHeight: 1.45 }}>{comment.body}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
