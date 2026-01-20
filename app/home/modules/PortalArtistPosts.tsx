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
  body: PortableTextBlock[]
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

  // Canonical: p drives surface+tab. Posts tab is p=posts.
  url.searchParams.set('p', 'posts')
  url.searchParams.set('post', slug)

  // retire legacy
  url.searchParams.delete('pt')
  url.searchParams.delete('panel')

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
        if (nextCursor) {
          // Your API currently uses offset, but you’re passing cursor. Keep your existing behavior:
          // treat cursor as offset string.
          u.searchParams.set('offset', nextCursor)
        }

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
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url)
      } catch {}

      // Keep user in-feed; just update query for stable link
      replaceQuery({
        p: 'posts',
        post: slug,
        pt: null,
        panel: null,
        album: null,
        track: null,
        t: null,
        autoplay: null,
      })
    },
    []
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
            <div style={{margin: '12px 0', display: 'flex', justifyContent: 'center'}}>
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
          <p style={{margin: '10px 0', lineHeight: 1.65, fontSize: 13, opacity: 0.92}}>{children}</p>
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
    <div style={{minWidth: 0}}>
      {/* Header row stays minimal (Ghost-ish) */}
      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10}}>
        <div style={{fontSize: 14, opacity: 0.86, letterSpacing: 0.2}}>{title}</div>

        {cursor ? (
          <button
            type="button"
            onClick={() => void fetchPage(cursor)}
            disabled={loading || requiresAuth}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.70)',
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

      <div style={{height: 1, background: 'rgba(255,255,255,0.07)', marginTop: 10}} />

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

      {/* Feed: fluid, subtle dividers, no boxed cards */}
      <div style={{marginTop: 6}}>
        {posts.map((p, idx) => {
          const isDeep = deepSlug === p.slug
          return (
            <div
              key={p.slug}
              ref={(el) => {
                if (!el) postEls.current.delete(p.slug)
                else postEls.current.set(p.slug, el)
              }}
              data-slug={p.slug}
              style={{
                padding: '14px 0',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {/* Body first */}
              <div
                style={
                  isDeep
                    ? {
                        borderRadius: 16,
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.03)',
                        boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)',
                      }
                    : undefined
                }
              >
                <PortableText value={p.body ?? []} components={components} />

                {/* Meta row: subtle, after content */}
                <div
                  style={{
                    marginTop: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    fontSize: 12,
                    opacity: 0.62,
                  }}
                >
                  <div style={{minWidth: 0}}>
                    <span>{fmtDate(p.publishedAt)}</span>
                    {p.pinned ? <span style={{marginLeft: 8, opacity: 0.85}}>• pinned</span> : null}
                    {/* title exists for slugging, but we don't lead with it */}
                    {p.title ? (
                      <span style={{marginLeft: 8, opacity: 0.0, position: 'absolute', left: -9999}}>
                        {p.title}
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => void onShare(p.slug)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.72)',
                      cursor: 'pointer',
                      fontSize: 12,
                      textDecoration: 'underline',
                      textUnderlineOffset: 3,
                      opacity: 0.9,
                      flex: '0 0 auto',
                    }}
                    title="Copy share link"
                    aria-label="Share post"
                  >
                    Share
                  </button>
                </div>
              </div>

              {/* extra breathing room before next divider */}
              {idx === posts.length - 1 ? <div style={{height: 4}} /> : null}
            </div>
          )
        })}

        {loading ? <div style={{fontSize: 12, opacity: 0.7, padding: '12px 0'}}>Loading…</div> : null}

        {!loading && !requiresAuth && posts.length === 0 ? (
          <div style={{fontSize: 13, opacity: 0.75, padding: '12px 0'}}>No posts yet.</div>
        ) : null}
      </div>
    </div>
  )
}
