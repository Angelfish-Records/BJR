// web/app/home/modules/PortalArtistPosts.tsx
'use client'

import React from 'react'
import {PortableText, type PortableTextComponents} from '@portabletext/react'
import type {PortableTextBlock} from '@portabletext/types'
import {useClientSearchParams, replaceQuery} from '@/app/home/urlState'

type Visibility = 'public' | 'friend' | 'patron' | 'partner'

type SanityImageValue = {
  _type: 'image'
  url?: string
  metadata?: {
    dimensions?: {
      width?: number
      height?: number
      aspectRatio?: number
    }
  }
}

type Post = {
  slug: string
  title?: string
  publishedAt: string
  visibility: Visibility
  pinned?: boolean
  body: PortableTextBlock[] // includes image blocks in practice; PortableText handles them via components.types.image
}

type ArtistPostsResponse = {
  ok: boolean
  requiresAuth: boolean
  posts: Post[]
  nextCursor: string | null
  correlationId?: string
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {year: 'numeric', month: 'short', day: 'numeric'})
  } catch {
    return iso
  }
}

function isTall(aspectRatio: number | null | undefined) {
  if (!aspectRatio || !Number.isFinite(aspectRatio)) return false
  return aspectRatio < 0.85
}

function shareUrlFor(slug: string) {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  url.searchParams.set('p', 'portal')
  url.searchParams.set('pt', url.searchParams.get('pt') || 'posts')
  url.searchParams.set('post', slug)
  // strip player-ish params
  url.searchParams.delete('album')
  url.searchParams.delete('track')
  url.searchParams.delete('t')
  url.searchParams.delete('autoplay')
  return url.toString()
}

function parsePostsResponse(raw: unknown): ArtistPostsResponse {
  const r = raw as Partial<ArtistPostsResponse>
  const posts = Array.isArray(r.posts) ? r.posts : []
  return {
    ok: Boolean(r.ok),
    requiresAuth: Boolean(r.requiresAuth),
    posts: posts as Post[],
    nextCursor: typeof r.nextCursor === 'string' ? r.nextCursor : null,
    correlationId: typeof r.correlationId === 'string' ? r.correlationId : undefined,
  }
}

export default function PortalArtistPosts(props: {
  title?: string
  pageSize: number
  requireAuthAfter: number
  minVisibility: Visibility
}) {
  const {title = 'Posts', pageSize, requireAuthAfter, minVisibility} = props

  const sp = useClientSearchParams()
  const deepSlug = (sp.get('post') ?? '').trim() || null

  const [posts, setPosts] = React.useState<Post[]>([])
  const [cursor, setCursor] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [requiresAuth, setRequiresAuth] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const seenRef = React.useRef<Set<string>>(new Set())
  const postEls = React.useRef<Map<string, HTMLDivElement>>(new Map())

  const fetchPage = React.useCallback(
    async (nextCursor: string | null) => {
      if (loading) return
      if (requiresAuth) return
      setLoading(true)
      setErr(null)

      try {
        const u = new URL('/api/artist-posts', window.location.origin)
        u.searchParams.set('limit', String(pageSize))
        u.searchParams.set('minVisibility', minVisibility)
        u.searchParams.set('requireAuthAfter', String(requireAuthAfter))
        if (nextCursor) u.searchParams.set('cursor', nextCursor)

        const res = await fetch(u.toString(), {method: 'GET'})
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`)

        const json = parsePostsResponse(await res.json())

        if (json.requiresAuth) {
          setRequiresAuth(true)
          setCursor(null)
          return
        }

        const nextPosts = Array.isArray(json.posts) ? json.posts : []
        setPosts((p) => (nextCursor ? [...p, ...nextPosts] : nextPosts))
        setCursor(json.nextCursor)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load posts'
        setErr(msg)
      } finally {
        setLoading(false)
      }
    },
    [loading, requiresAuth, pageSize, minVisibility, requireAuthAfter]
  )

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    void fetchPage(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep link: once posts load (or after pagination grows), scroll to slug if present
  React.useEffect(() => {
    if (!deepSlug) return
    const el = postEls.current.get(deepSlug)
    if (!el) return
    el.scrollIntoView({behavior: 'smooth', block: 'start'})
  }, [deepSlug, posts.length])

  // Mark seen (server-owned session gating)
  const markSeen = React.useCallback(async (slug: string) => {
    if (!slug) return
    if (seenRef.current.has(slug)) return
    seenRef.current.add(slug)

    try {
      await fetch('/api/artist-posts/seen', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({slug}),
      })
    } catch {
      // ignore
    }
  }, [])

  // IntersectionObserver per-post
  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const io = new IntersectionObserver(
      (entries) => {
        for (const ent of entries) {
          if (!ent.isIntersecting) continue
          const el = ent.target as HTMLElement
          const slug = el.dataset.slug ?? ''
          if (slug) void markSeen(slug)
        }
      },
      {root: null, threshold: 0.6}
    )

    for (const p of posts) {
      const el = postEls.current.get(p.slug)
      if (el) io.observe(el)
    }

    return () => io.disconnect()
  }, [posts, markSeen])

  const onShare = React.useCallback(
    async (slug: string) => {
      const url = shareUrlFor(slug)
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url)
        }
      } catch {}

      // keep user in-feed; just update query for stable link
      replaceQuery({
        p: 'portal',
        pt: sp.get('pt') ?? 'posts',
        post: slug,
        album: null,
        track: null,
        t: null,
        autoplay: null,
      })
    },
    [sp]
  )

  const components: PortableTextComponents = React.useMemo(
    () => ({
      types: {
        image: ({value}: {value: SanityImageValue}) => {
          const url = value?.url ?? null
          const ar = value?.metadata?.dimensions?.aspectRatio
          if (!url) return null

          const tall = isTall(ar)
          const maxWidth = tall ? 520 : undefined

          return (
            <div
              style={{
                marginTop: 10,
                marginBottom: 10,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: maxWidth ?? '100%',
                  borderRadius: 18,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
              </div>
            </div>
          )
        },
      },
      block: {
        normal: ({children}) => (
          <p style={{margin: '10px 0', lineHeight: 1.6, fontSize: 13, opacity: 0.9}}>{children}</p>
        ),
      },
      marks: {
        link: ({value, children}) => {
          const href = typeof value?.href === 'string' ? value.href : '#'
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'rgba(255,255,255,0.90)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                opacity: 0.9,
              }}
            >
              {children}
            </a>
          )
        },
      },
    }),
    []
  )

  return (
    <div
      style={{
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.04)',
        padding: 14,
        minWidth: 0,
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10}}>
        <div style={{fontSize: 15, opacity: 0.92}}>{title}</div>
        {cursor ? (
          <button
            type="button"
            onClick={() => void fetchPage(cursor)}
            disabled={loading || requiresAuth}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.75)',
              cursor: loading ? 'default' : 'pointer',
              fontSize: 12,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              opacity: loading ? 0.5 : 0.85,
            }}
          >
            Load more
          </button>
        ) : null}
      </div>

      {requiresAuth ? (
        <div style={{marginTop: 12, fontSize: 13, opacity: 0.85, lineHeight: 1.55}}>
          Sign in to keep reading posts.
        </div>
      ) : null}

      {err ? (
        <div style={{marginTop: 12, fontSize: 13, opacity: 0.8}}>
          {err}
        </div>
      ) : null}

      <div style={{marginTop: 10, display: 'grid', gap: 12}}>
        {posts.map((p) => (
          <div
            key={p.slug}
            ref={(el) => {
              if (!el) postEls.current.delete(p.slug)
              else postEls.current.set(p.slug, el)
            }}
            data-slug={p.slug}
            style={{
              borderRadius: 16,
              border:
                deepSlug === p.slug
                  ? '1px solid color-mix(in srgb, var(--accent) 35%, rgba(255,255,255,0.12))'
                  : '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(0,0,0,0.22)',
              padding: 14,
              boxShadow:
                deepSlug === p.slug
                  ? '0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent)'
                  : undefined,
            }}
          >
            <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10}}>
              <div style={{minWidth: 0}}>
                {p.title ? (
                  <div
                    style={{
                      fontSize: 14,
                      opacity: 0.92,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.title}
                  </div>
                ) : null}
                <div style={{fontSize: 12, opacity: 0.65}}>
                  {fmtDate(p.publishedAt)}
                  {p.pinned ? <span style={{marginLeft: 8, opacity: 0.8}}>• pinned</span> : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void onShare(p.slug)}
                style={{
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.86)',
                  borderRadius: 999,
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  opacity: 0.9,
                  flex: '0 0 auto',
                }}
                title="Copy share link"
                aria-label="Share post"
              >
                Share
              </button>
            </div>

            <div style={{marginTop: 8}}>
              <PortableText value={p.body ?? []} components={components} />
            </div>
          </div>
        ))}

        {loading ? <div style={{fontSize: 12, opacity: 0.7}}>Loading…</div> : null}

        {!loading && !requiresAuth && posts.length === 0 ? (
          <div style={{fontSize: 13, opacity: 0.75}}>No posts yet.</div>
        ) : null}
      </div>
    </div>
  )
}
