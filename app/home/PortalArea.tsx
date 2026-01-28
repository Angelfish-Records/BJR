// web/app/home/PortalArea.tsx
'use client'

import React from 'react'
import {createPortal} from 'react-dom'
import {useAuth} from '@clerk/nextjs'
import PortalShell, {PortalPanelSpec} from './PortalShell'
import {useClientSearchParams, replaceQuery, getAutoplayFlag} from './urlState'
import {usePlayer} from '@/app/home/player/PlayerState'
import {useGlobalTransportKeys} from './player/useGlobalTransportKeys'
import type {PlayerTrack, AlbumInfo, AlbumNavItem, Tier} from '@/lib/types'
import PlayerController from './player/PlayerController'
import MiniPlayer from './player/MiniPlayer'
import ActivationGate from '@/app/home/ActivationGate'
import Image from 'next/image'

function normalizePanel(raw: string | null | undefined): 'player' | 'portal' {
  const v = (raw ?? '').trim()
  return v === 'portal' ? 'portal' : 'player'
}

function MiniPlayerHost(props: {onExpand: () => void}) {
  const {onExpand} = props
  const p = usePlayer()

  const intent = p.intent
  const status = p.status
  const current = p.current
  const queueLen = p.queue.length

  const [miniActive, setMiniActive] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.sessionStorage.getItem('af:miniActive') === '1'
  })

  React.useEffect(() => {
    const shouldActivate =
      intent === 'play' ||
      status === 'playing' ||
      status === 'paused' ||
      Boolean(current) ||
      queueLen > 0

    if (!miniActive && shouldActivate) {
      setMiniActive(true)
      try {
        window.sessionStorage.setItem('af:miniActive', '1')
      } catch {}
    }
  }, [miniActive, intent, status, current, queueLen])

  if (!miniActive) return null
  return <MiniPlayer onExpand={onExpand} artworkUrl={p.queueContextArtworkUrl ?? null} />
}

type AlbumPayload = {album: AlbumInfo | null; tracks: PlayerTrack[]}

function getSavedSt(slug: string): string {
  try {
    return (sessionStorage.getItem(`af_st:${slug}`) ?? '').trim()
  } catch {
    return ''
  }
}

function setSavedSt(slug: string, st: string) {
  try {
    sessionStorage.setItem(`af_st:${slug}`, st)
  } catch {}
}

function IconPlayer() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="9,7 19,12 9,17" />
    </svg>
  )
}

function IconPortal() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

/**
 * Small, top-right bar (kept for auth-ish messaging only).
 * In your current design this lives under ActivationGate and is spotlight-clonable.
 */
function MiniMessageBar(props: {attentionMessage: string | null}) {
  const {attentionMessage} = props
  if (!attentionMessage) return null

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(0,0,0,0.28)',
        padding: '10px 12px',
        fontSize: 12,
        opacity: 0.92,
        lineHeight: 1.45,
        textAlign: 'left',
        maxWidth: '100%',
        width: '100%',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        boxShadow: '0 16px 40px rgba(0,0,0,0.22)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          display: 'grid',
          placeItems: 'center',
          marginTop: 1,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.14)',
          flex: '0 0 auto',
        }}
      >
        <span aria-hidden>⚠️</span>
      </div>

      <div style={{minWidth: 0}}>{attentionMessage}</div>
    </div>
  )
}

type BannerTone = 'success' | 'neutral' | 'warn'

function bannerStyle(tone: BannerTone) {
  const border =
    tone === 'success'
      ? 'color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.14))'
      : tone === 'warn'
        ? 'rgba(255,255,255,0.18)'
        : 'rgba(255,255,255,0.14)'

  const bg =
    tone === 'success'
      ? 'color-mix(in srgb, var(--accent) 10%, rgba(0,0,0,0.22))'
      : tone === 'warn'
        ? 'rgba(0,0,0,0.28)'
        : 'rgba(0,0,0,0.22)'

  return {border, bg}
}

/**
 * Full-width banner UNDER the topbar.
 * Used for non-auth flow messages (checkout/gift/etc).
 */
function FullWidthBanner(props: {
  kind: 'gift' | 'checkout' | null
  code: string | null
  onDismiss: () => void
}) {
  const {kind, code, onDismiss} = props
  if (!kind || !code) return null

  let tone: BannerTone = 'neutral'
  let icon: React.ReactNode = null
  let text: React.ReactNode = null

  if (kind === 'checkout') {
    if (code === 'success') {
      tone = 'success'
      icon = <span aria-hidden>✅</span>
      text = <>Checkout completed. If your access hasn&apos;t appeared yet, refresh once (webhooks can be a beat behind).</>
    } else if (code === 'cancel') {
      tone = 'neutral'
      icon = <span aria-hidden>⤺</span>
      text = <>Checkout cancelled.</>
    } else {
      return null
    }
  }

  if (kind === 'gift') {
    if (code === 'ready') {
      tone = 'success'
      icon = <span aria-hidden>🎁</span>
      text = <>Gift activated. Your content is now available.</>
    } else if (code === 'not_paid') {
      tone = 'neutral'
      icon = <span aria-hidden>⏳</span>
      text = <>This gift hasn&apos;t completed payment yet. If you just paid, refresh in a moment.</>
    } else if (code === 'wrong_account') {
      tone = 'warn'
      icon = <span aria-hidden>⚠️</span>
      text = <>This gift was sent to a different email. Sign in with the recipient account.</>
    } else if (code === 'claim_code_missing') {
      tone = 'warn'
      icon = <span aria-hidden>⚠️</span>
      text = <>That link is missing its claim code. Open the exact link from the email.</>
    } else if (code === 'invalid_claim') {
      tone = 'warn'
      icon = <span aria-hidden>⚠️</span>
      text = <>That claim code doesn&apos;t match this gift. Open the exact link from the email.</>
    } else if (code === 'missing') {
      tone = 'warn'
      icon = <span aria-hidden>⚠️</span>
      text = <>That gift link looks invalid.</>
    } else {
      return null
    }
  }

  const {border, bg} = bannerStyle(tone)

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginTop: 10,
        borderRadius: 16,
        border: `1px solid ${border}`,
        background: bg,
        padding: '12px 14px',
        fontSize: 13,
        opacity: 0.96,
        lineHeight: 1.45,
        textAlign: 'left',
        width: '100%',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        boxShadow: '0 18px 44px rgba(0,0,0,0.22)',
        position: 'relative',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          display: 'grid',
          placeItems: 'center',
          marginTop: 1,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.14)',
          flex: '0 0 auto',
        }}
      >
        {icon}
      </div>

      <div style={{minWidth: 0, paddingRight: 26}}>{text}</div>

      <button
        type="button"
        aria-label="Dismiss message"
        onClick={onDismiss}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.88)',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
          lineHeight: 1,
          fontSize: 16,
          userSelect: 'none',
        }}
      >
        ×
      </button>
    </div>
  )
}

function BodyPortal(props: {children: React.ReactNode}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted) return null
  if (typeof document === 'undefined') return null
  return createPortal(props.children, document.body)
}

function useAnchorRect(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [rect, setRect] = React.useState<DOMRect | null>(null)

  const rafRef = React.useRef<number | null>(null)
  const roRef = React.useRef<ResizeObserver | null>(null)
  const elRef = React.useRef<HTMLElement | null>(null)
  const enabledRef = React.useRef<boolean>(enabled)

  React.useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  React.useEffect(() => {
    if (!enabled) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      roRef.current?.disconnect()
      roRef.current = null
      elRef.current = null
      setRect(null)
      return
    }

    const el = ref.current
    if (!el) return
    elRef.current = el

    const measureNow = () => {
      const cur = elRef.current
      if (!cur) return
      if (typeof document !== 'undefined' && document.hidden) return

      const r = cur.getBoundingClientRect()
      setRect(new DOMRect(Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)))
    }

    const scheduleMeasure = () => {
      if (!enabledRef.current) return
      if (rafRef.current != null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        measureNow()
      })
    }

    scheduleMeasure()

    const ro = new ResizeObserver(() => scheduleMeasure())
    ro.observe(el)
    roRef.current = ro

    const onScroll = () => scheduleMeasure()
    const onResize = () => scheduleMeasure()

    window.addEventListener('scroll', onScroll, {capture: true, passive: true})
    window.addEventListener('resize', onResize, {passive: true})

    const onVis = () => {
      if (!enabledRef.current) return
      if (typeof document !== 'undefined' && !document.hidden) scheduleMeasure()
    }
    document.addEventListener('visibilitychange', onVis, {passive: true})

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null

      ro.disconnect()
      roRef.current = null
      elRef.current = null

      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [ref, enabled])

  return rect
}

function SpotlightVeil(props: {active: boolean}) {
  const {active} = props
  const debugbarStyleRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!active) return
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prev
    }
  }, [active])

  React.useEffect(() => {
    const el = typeof document !== 'undefined' ? document.getElementById('af-admin-debugbar') : null
    if (!el) return

    if (debugbarStyleRef.current == null) {
      debugbarStyleRef.current = el.getAttribute('style') ?? ''
    }

    if (active) {
      el.setAttribute(
        'style',
        `${debugbarStyleRef.current}; position: relative; z-index: 50000; pointer-events: auto;`
      )
    } else {
      const orig = debugbarStyleRef.current ?? ''
      if (orig.trim()) el.setAttribute('style', orig)
      else el.removeAttribute('style')
    }
  }, [active])

  if (!active) return null
  return (
    <BodyPortal>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 20000,
          pointerEvents: 'auto',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          background: 'rgba(0,0,0,0.30)',
        }}
      />
    </BodyPortal>
  )
}

function SpotlightClone(props: {active: boolean; anchorRect: DOMRect | null; children: React.ReactNode}) {
  const {active, anchorRect, children} = props
  if (!active) return null
  if (!anchorRect) return null

  return (
    <BodyPortal>
      <div
        style={{
          position: 'fixed',
          top: anchorRect.top,
          left: anchorRect.left,
          width: anchorRect.width,
          height: anchorRect.height,
          zIndex: 30000,
          pointerEvents: 'auto',
          display: 'block',
        }}
      >
        {children}
      </div>
    </BodyPortal>
  )
}

export default function PortalArea(props: {
  portalPanel: React.ReactNode
  topLogoUrl?: string | null
  topLogoHeight?: number | null
  albumSlug: string
  album: AlbumInfo | null
  tracks: PlayerTrack[]
  albums: AlbumNavItem[]
  attentionMessage?: string | null
  tier?: string | null
  isPatron?: boolean
  isAdmin?: boolean
  canManageBilling?: boolean
}) {
  const {
    portalPanel,
    albumSlug,
    album: initialAlbum,
    tracks: initialTracks,
    albums,
    attentionMessage = null,
    tier = null,
    isPatron = false,
    canManageBilling = false,
  } = props

  const p = usePlayer()
  const {setQueue, play, selectTrack, setPendingTrackId} = p
  useGlobalTransportKeys(p, {enabled: true})
  const sp = useClientSearchParams()
  const {isSignedIn} = useAuth()

  // URL-driven codes
  const gift = (sp.get('gift') ?? '').trim() || null
  const checkout = (sp.get('checkout') ?? '').trim() || null

  // Non-auth messages belong in the FULL-WIDTH banner.
  // Track a "dismissed" flag keyed by the current message identity.
  const bannerKey = React.useMemo(() => {
    if (gift) return `gift:${gift}`
    if (checkout) return `checkout:${checkout}`
    return ''
  }, [gift, checkout])

  const dismissedKeyRef = React.useRef<string>('') // remember what the user dismissed

  const [bannerDismissed, setBannerDismissed] = React.useState(false)

  // When banner identity changes, reset dismissal.
  React.useEffect(() => {
    if (!bannerKey) {
      setBannerDismissed(false)
      dismissedKeyRef.current = ''
      return
    }
    if (dismissedKeyRef.current !== bannerKey) setBannerDismissed(false)
  }, [bannerKey])

  const dismissBanner = React.useCallback(() => {
    if (!bannerKey) return
    dismissedKeyRef.current = bannerKey
    setBannerDismissed(true)
    // Also clear query param so it doesn't come back on refresh.
    if (gift) replaceQuery({gift: null})
    if (checkout) replaceQuery({checkout: null})
  }, [bannerKey, gift, checkout])

  // Auto-dismiss when user switches panels (player <-> portal)
  const currentPanel = normalizePanel(sp.get('p') ?? 'player')
  const lastPanelRef = React.useRef<'player' | 'portal'>(currentPanel)
  React.useEffect(() => {
    const prev = lastPanelRef.current
    if (prev !== currentPanel) {
      lastPanelRef.current = currentPanel
      if (!bannerDismissed && bannerKey) dismissBanner()
    }
  }, [currentPanel, bannerDismissed, bannerKey, dismissBanner])

  // Auth-ish messaging stays in the small bar (and spotlight uses it).
  const derivedAttentionMessage =
    attentionMessage ?? (p.shouldShowTopbarBlockMessage ? (p.lastError ?? null) : null)

  const spotlightEligibleCode =
    p.blockedCode === 'AUTH_REQUIRED' || p.blockedCode === 'ANON_CAP_REACHED' || p.blockedCode === 'CAP_REACHED'

  const dbgForceSpotlight =
    process.env.NEXT_PUBLIC_ADMIN_DEBUG === '1' &&
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem('af:dbgSpotlight') === '1'

  const spotlightAttention =
    !!derivedAttentionMessage &&
    p.blockUiMode === 'global' &&
    spotlightEligibleCode &&
    (!isSignedIn || dbgForceSpotlight)

  const qAlbum = sp.get('album')
  const qTrack = sp.get('track')

  const isPlayer = currentPanel === 'player'
  const qAutoplay = getAutoplayFlag(sp)
  const qShareToken = sp.get('st') ?? sp.get('share') ?? null
  const hasSt = ((sp.get('st') ?? sp.get('share') ?? '').trim().length > 0)

  const patchQuery = React.useCallback((patch: Record<string, string | null | undefined>) => {
    replaceQuery(patch)
  }, [])

  const forceSurface = React.useCallback(
    (surface: 'player' | 'portal') => {
      const desired = surface === 'portal' ? 'portal' : 'player'
      if (currentPanel === desired) return
      patchQuery({p: desired})
    },
    [patchQuery, currentPanel]
  )

  const [currentAlbumSlug, setCurrentAlbumSlug] = React.useState<string>(albumSlug)
  const [album, setAlbum] = React.useState<AlbumInfo | null>(initialAlbum)
  const [tracks, setTracks] = React.useState<PlayerTrack[]>(initialTracks)
  const [isBrowsingAlbum, setIsBrowsingAlbum] = React.useState(false)

  React.useEffect(() => {
    setAlbum(initialAlbum)
    setTracks(initialTracks)
    setCurrentAlbumSlug(albumSlug)
  }, [albumSlug, initialAlbum, initialTracks])

  const fetchSeq = React.useRef(0)
  const isBrowsingRef = React.useRef(false)

  React.useEffect(() => {
    isBrowsingRef.current = isBrowsingAlbum
  }, [isBrowsingAlbum])

  const onSelectAlbum = React.useCallback(
    async (slug: string) => {
      if (!slug) return
      if (isBrowsingRef.current) return

      const saved = getSavedSt(slug)

      patchQuery({
        p: 'player',
        album: slug,
        track: null,
        t: null,
        autoplay: null,
        st: saved || null,
        share: null,
      })

      setIsBrowsingAlbum(true)
      setCurrentAlbumSlug(slug)
      setAlbum(null)
      setTracks([])

      const seq = ++fetchSeq.current

      try {
        const res = await fetch(`/api/albums/${encodeURIComponent(slug)}`, {method: 'GET'})
        if (!res.ok) throw new Error(`Album fetch failed (${res.status})`)
        const json = (await res.json()) as AlbumPayload
        if (seq !== fetchSeq.current) return

        setAlbum(json.album ?? null)
        setTracks(Array.isArray(json.tracks) ? json.tracks : [])
      } catch (e) {
        if (seq !== fetchSeq.current) return
        console.error(e)
      } finally {
        if (seq !== fetchSeq.current) return
        setIsBrowsingAlbum(false)
      }
    },
    [patchQuery]
  )

  React.useEffect(() => {
    if (!isPlayer) return
    if (!qAlbum) return
    if (qAlbum !== currentAlbumSlug) void onSelectAlbum(qAlbum)
  }, [isPlayer, qAlbum, currentAlbumSlug, onSelectAlbum])

  React.useEffect(() => {
    if (!isPlayer) return
    if (!qTrack) return
    selectTrack(qTrack)
    setPendingTrackId(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayer, qTrack])

  const primedRef = React.useRef(false)
  React.useEffect(() => {
    if (!isPlayer) return
    if (primedRef.current) return
    if (!album || tracks.length === 0) return

    if (p.current || p.queue.length > 0) {
      primedRef.current = true
      return
    }

    if (qTrack) {
      primedRef.current = true
      return
    }

    const first = tracks[0]
    if (!first?.id) return

    const ctxId = hasSt ? (album.catalogId ?? undefined) : ((album.catalogId ?? album.id) ?? undefined)
    const ctxSlug = qAlbum ?? currentAlbumSlug

    p.setQueue(tracks, {
      contextId: ctxId,
      contextSlug: ctxSlug,
      contextTitle: album.title ?? undefined,
      contextArtist: album.artist ?? undefined,
      artworkUrl: album.artworkUrl ?? null,
    })

    p.selectTrack(first.id)
    p.setPendingTrackId(undefined)

    primedRef.current = true
  }, [isPlayer, album, tracks, hasSt, qAlbum, currentAlbumSlug, qTrack, p])

  const autoplayFiredRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!isPlayer) return
    if (!qAutoplay) return
    if (!qTrack) return

    if (!qShareToken) {
      patchQuery({autoplay: null})
      return
    }

    if (!album || tracks.length === 0) return

    const key = `${qAlbum ?? ''}:${qTrack}:${qShareToken}`
    if (autoplayFiredRef.current === key) return
    autoplayFiredRef.current = key

    const ctxId = hasSt ? (album.catalogId ?? undefined) : ((album.catalogId ?? album.id) ?? undefined)
    const ctxSlug = qAlbum ?? currentAlbumSlug

    setQueue(tracks, {
      contextId: ctxId,
      contextSlug: ctxSlug,
      contextTitle: album.title ?? undefined,
      contextArtist: album.artist ?? undefined,
      artworkUrl: album.artworkUrl ?? null,
    })

    const t = tracks.find((x) => x.id === qTrack)
    play(t)
    patchQuery({autoplay: null})
  }, [
    isPlayer,
    qAutoplay,
    qTrack,
    qAlbum,
    qShareToken,
    album,
    tracks,
    hasSt,
    currentAlbumSlug,
    play,
    setQueue,
    patchQuery,
  ])

  React.useEffect(() => {
    if (!isPlayer) return

    const slug = qAlbum ?? currentAlbumSlug
    if (!slug) return

    const stFromUrl = (sp.get('st') ?? sp.get('share') ?? '').trim()

    if (stFromUrl) {
      setSavedSt(slug, stFromUrl)
      return
    }

    const saved = getSavedSt(slug)
    if (saved) patchQuery({st: saved, share: null})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayer, qAlbum, currentAlbumSlug])

  React.useEffect(() => {
    const onOpen = (ev: Event) => {
      const e = ev as CustomEvent<{albumSlug?: string | null}>
      const slug = e.detail?.albumSlug ?? null
      forceSurface('player')
      if (slug) void onSelectAlbum(slug)
    }

    window.addEventListener('af:open-player', onOpen as EventListener)
    return () => window.removeEventListener('af:open-player', onOpen as EventListener)
  }, [onSelectAlbum, forceSurface])

  const viewerTier: Tier = tier === 'friend' || tier === 'patron' || tier === 'partner' ? tier : 'none'

  const panels = React.useMemo<PortalPanelSpec[]>(
    () => [
      {
        id: 'player',
        label: 'Player',
        content: (
          <PlayerController
            albumSlug={currentAlbumSlug}
            album={album}
            tracks={tracks}
            albums={albums}
            onSelectAlbum={onSelectAlbum}
            isBrowsingAlbum={isBrowsingAlbum}
            openPlayerPanel={() => forceSurface('player')}
            viewerTier={viewerTier}
          />
        ),
      },
      {id: 'portal', label: 'Portal', content: portalPanel},
    ],
    [portalPanel, currentAlbumSlug, album, tracks, albums, forceSurface, isBrowsingAlbum, onSelectAlbum, viewerTier]
  )

  const spotlightAnchorRef = React.useRef<HTMLDivElement | null>(null)
  const spotlightRect = useAnchorRect(spotlightAnchorRef, spotlightAttention)

  const gateNode = (
    <ActivationGate
      attentionMessage={derivedAttentionMessage}
      canManageBilling={canManageBilling}
      isPatron={isPatron}
      tier={tier}
    >
      <div />
    </ActivationGate>
  )

  const miniMsgNode = <MiniMessageBar attentionMessage={derivedAttentionMessage} />

  const bannerKind: 'gift' | 'checkout' | null = gift ? 'gift' : checkout ? 'checkout' : null
  const bannerCode = gift ?? checkout ?? null

  const bannerNode =
    !bannerDismissed && bannerKind && bannerCode ? (
      <FullWidthBanner kind={bannerKind} code={bannerCode} onDismiss={dismissBanner} />
    ) : null

  return (
    <>
      <SpotlightVeil active={spotlightAttention} />

      <SpotlightClone active={spotlightAttention} anchorRect={spotlightRect}>
        <div style={{pointerEvents: 'auto'}}>
          {gateNode}
          {miniMsgNode}
        </div>
      </SpotlightClone>

      <div style={{height: '100%', minHeight: 0, minWidth: 0, display: 'grid'}}>
        <PortalShell
          panels={panels}
          defaultPanelId="player"
          syncToQueryParam={false}
          activePanelId={isPlayer ? 'player' : 'portal'}
          onPanelChange={(panelId) => {
            if (panelId === 'player') forceSurface('player')
            else forceSurface('portal')
          }}
          headerPortalId="af-portal-topbar-slot"
          header={() => (
            <div
              style={{
                width: '100%',
                borderRadius: 0,
                border: 'none',
                background: 'transparent',
                padding: 12,
                minWidth: 0,
                position: 'relative',
              }}
            >
              <style>{`
.afTopBar { display:grid; grid-template-columns:1fr auto 1fr; grid-template-rows:1fr; align-items:stretch; gap:12px; min-width:0; }
.afTopBarControls { display: contents; }
.afTopBarLeft { grid-column:1; grid-row:1; min-width:0; display:flex; align-items:flex-end; justify-content:flex-start; gap:10px; align-self:stretch; }
.afTopBarLogo { grid-column:2; grid-row:1; min-width:0; display:flex; align-items:flex-end; justify-content:center; padding:6px 0 2px; align-self:stretch; }
.afTopBarLogoInner { width:fit-content; display:grid; place-items:end center; }
.afTopBarRight { grid-column:3; grid-row:1; min-width:0; display:flex; align-items:flex-end; justify-content:flex-end; align-self:stretch; }
.afTopBarRightInner { max-width:520px; min-width:0; height:100%; display:flex; flex-direction:column; justify-content:flex-end; }
@media (max-width:720px) {
  .afTopBar { grid-template-columns:1fr; grid-template-rows:auto auto; gap:10px; align-items:stretch; justify-items:stretch; }
  .afTopBarLogo { grid-row:1; grid-column:1 / -1; width:100%; padding:10px 0 0; display:flex; align-items:flex-end; justify-content:center; }
  .afTopBarControls { grid-row:2; display:grid; grid-template-columns:auto 1fr; align-items:stretch; column-gap:10px; row-gap:0px; width:100%; min-width:0; }
  .afTopBarLeft { grid-column:1; justify-self:start; display:flex; align-items:flex-end; align-self:stretch; }
  .afTopBarRight { grid-column:2; justify-self:end; width:100%; display:flex; align-items:flex-end; justify-content:flex-end; align-self:stretch; }
  .afTopBarRightInner { margin-left:auto; max-width:520px; height:100%; display:flex; flex-direction:column; justify-content:flex-end; }
}
`}</style>

              <div className="afTopBar" style={{position: 'relative', zIndex: 5}}>
                <div className="afTopBarLogo">
                  <div className="afTopBarLogoInner">
                    {props.topLogoUrl ? (
                      <Image
                        src={props.topLogoUrl}
                        alt="Logo"
                        height={Math.max(16, Math.min(120, props.topLogoHeight ?? 38))}
                        width={Math.max(16, Math.min(120, props.topLogoHeight ?? 38))}
                        sizes="(max-width: 720px) 120px, 160px"
                        style={{
                          height: Math.max(16, Math.min(120, props.topLogoHeight ?? 38)),
                          width: 'auto',
                          objectFit: 'contain',
                          opacity: 0.94,
                          userSelect: 'none',
                          filter: 'drop-shadow(0 10px 22px rgba(0,0,0,0.28))',
                        }}
                      />
                    ) : (
                      <div
                        aria-label="AF"
                        title="AF"
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,0.14)',
                          background: 'rgba(0,0,0,0.22)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 13,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          opacity: 0.92,
                          userSelect: 'none',
                        }}
                      >
                        AF
                      </div>
                    )}
                  </div>
                </div>

                <div className="afTopBarControls">
                  <div className="afTopBarLeft">
                    <button
                      type="button"
                      aria-label="Player"
                      title="Player"
                      onClick={() => forceSurface('player')}
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 999,
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: isPlayer
                          ? 'color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))'
                          : 'rgba(255,255,255,0.04)',
                        boxShadow: isPlayer
                          ? '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)'
                          : '0 12px 26px rgba(0,0,0,0.18)',
                        color: 'rgba(255,255,255,0.90)',
                        cursor: 'pointer',
                        opacity: isPlayer ? 0.98 : 0.78,
                        display: 'grid',
                        placeItems: 'center',
                        userSelect: 'none',
                      }}
                    >
                      <IconPlayer />
                    </button>

                    <button
                      type="button"
                      aria-label="Portal"
                      title="Portal"
                      onClick={() => forceSurface('portal')}
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 999,
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: !isPlayer
                          ? 'color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))'
                          : 'rgba(255,255,255,0.04)',
                        boxShadow: !isPlayer
                          ? '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)'
                          : '0 12px 26px rgba(0,0,0,0.18)',
                        color: 'rgba(255,255,255,0.90)',
                        cursor: 'pointer',
                        opacity: !isPlayer ? 0.98 : 0.78,
                        display: 'grid',
                        placeItems: 'center',
                        userSelect: 'none',
                      }}
                    >
                      <IconPortal />
                    </button>
                  </div>

                  <div className="afTopBarRight">
                    <div className="afTopBarRightInner" style={{maxWidth: 520, minWidth: 0}}>
                      <div
                        ref={spotlightAnchorRef}
                        style={{
                          position: 'relative',
                          visibility: spotlightAttention ? 'hidden' : 'visible',
                          pointerEvents: spotlightAttention ? 'none' : 'auto',
                        }}
                      >
                        {gateNode}
                        {miniMsgNode}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ✅ Full-width banner lives directly under the topbar */}
              {bannerNode}
            </div>
          )}
        />

        <MiniPlayerHost onExpand={() => forceSurface('player')} />
      </div>
    </>
  )
}
