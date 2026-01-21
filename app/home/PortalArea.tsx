// web/app/home/PortalArea.tsx
'use client'

import React from 'react'
import {createPortal} from 'react-dom'
import {useAuth} from '@clerk/nextjs'
import PortalShell, {PortalPanelSpec} from './PortalShell'
import {useClientSearchParams, replaceQuery, getAutoplayFlag} from './urlState'
import {usePlayer} from '@/app/home/player/PlayerState'
import type {PlayerTrack, AlbumInfo, AlbumNavItem, Tier} from '@/lib/types'
import PlayerController from './player/PlayerController'
import MiniPlayer from './player/MiniPlayer'
import ActivationGate from '@/app/home/ActivationGate'
import Image from 'next/image'

const LEGACY_PORTAL_P = 'portal'
const DEFAULT_PORTAL_TAB = 'download'

function normalizeP(raw: string | null | undefined): string {
  const v = (raw ?? '').trim()
  return v || 'player'
}

function QueueBootstrapper(props: {albumId: string | null; tracks: PlayerTrack[]}) {
  const p = usePlayer()

  React.useEffect(() => {
    if (p.queue.length > 0) return
    if (!props.tracks.length) return
    p.setQueue(props.tracks, {contextId: props.albumId ?? undefined})
  }, [p, p.queue.length, props.albumId, props.tracks])

  return null
}

function MiniPlayerHost(props: {onExpand: () => void}) {
  const {onExpand} = props
  const p = usePlayer()

  const [miniActive, setMiniActive] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.sessionStorage.getItem('af:miniActive') === '1'
  })

  React.useEffect(() => {
    const shouldActivate =
      p.intent === 'play' ||
      p.status === 'playing' ||
      p.status === 'paused' ||
      Boolean(p.current) ||
      p.queue.length > 0

    if (!miniActive && shouldActivate) {
      setMiniActive(true)
      try {
        window.sessionStorage.setItem('af:miniActive', '1')
      } catch {}
    }
  }, [miniActive, p])

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
  } catch {
    // ignore
  }
}

function getLastPortalTab(): string | null {
  try {
    return (sessionStorage.getItem('af:lastPortalTab') ?? '').trim() || null
  } catch {
    return null
  }
}

function setLastPortalTab(id: string) {
  try {
    sessionStorage.setItem('af:lastPortalTab', id)
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

function MessageBar(props: {checkout: string | null; attentionMessage: string | null}) {
  const {checkout, attentionMessage} = props

  const showCheckout = checkout === 'success' || checkout === 'cancel'
  const showAttention = !!attentionMessage
  if (!showCheckout && !showAttention) return null

  const checkoutIsSuccess = checkout === 'success'

  let leftIcon: React.ReactNode = null
  let text: React.ReactNode = null
  let tone: 'success' | 'neutral' | 'warn' = 'neutral'

  if (showAttention) {
    tone = 'warn'
    leftIcon = <span aria-hidden>⚠️</span>
    text = <>{attentionMessage}</>
  } else if (showCheckout) {
    tone = checkoutIsSuccess ? 'success' : 'neutral'
    leftIcon = <span aria-hidden>{checkoutIsSuccess ? '✅' : '⤺'}</span>
    text = checkoutIsSuccess ? (
      <>Checkout completed. If entitlements haven&apos;t appeared yet, refresh once (webhooks can be a beat behind).</>
    ) : (
      <>Checkout cancelled.</>
    )
  }

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

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 14,
        border: `1px solid ${border}`,
        background: bg,
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
        {leftIcon}
      </div>

      <div style={{minWidth: 0}}>{text}</div>
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

  React.useEffect(() => {
    if (!enabled) {
      setRect(null)
      return
    }

    const el = ref.current
    if (!el) return

    const update = () => {
      const r = el.getBoundingClientRect()
      // DOMRect is live-ish in some browsers; copy primitives.
      setRect(
        new DOMRect(
          Math.round(r.x),
          Math.round(r.y),
          Math.round(r.width),
          Math.round(r.height)
        )
      )
    }

    update()

    const ro = new ResizeObserver(() => update())
    ro.observe(el)

    const onScroll = () => update()
    const onResize = () => update()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)

    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [ref, enabled])

  return rect
}

/**
 * Full-screen blur + interaction blocker.
 * Also lifts #af-admin-debugbar above the veil so you can always toggle spotlight off.
 */
function SpotlightVeil(props: {active: boolean}) {
  const {active} = props

  React.useEffect(() => {
    if (!active) return
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prev
    }
  }, [active])

  React.useEffect(() => {
    // “escape hatch” — keep debug bar clickable above veil
    const el = typeof document !== 'undefined' ? document.getElementById('af-admin-debugbar') : null
    if (!el) return

    const prev = el.getAttribute('style') ?? ''
    if (active) {
      // make it win against stacking contexts
      el.setAttribute(
        'style',
        `${prev}; position: relative; z-index: 50000; pointer-events: auto;`
      )
    } else {
      // restore exact previous inline style (or remove if empty)
      if (prev.trim()) el.setAttribute('style', prev)
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
          pointerEvents: 'auto', // blocks everything underneath
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          background: 'rgba(0,0,0,0.30)',
        }}
      />
    </BodyPortal>
  )
}

/**
 * Render a clone “above” the veil at the *exact same* screen position as the anchor.
 * The in-place version stays in the DOM (visibility:hidden) to preserve layout perfectly.
 */
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
          zIndex: 30000, // above veil
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
  checkout?: string | null
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
    checkout = null,
    attentionMessage = null,
    tier = null,
    isPatron = false,
    canManageBilling = false,
  } = props

  const p = usePlayer()
  const sp = useClientSearchParams()
  const hasSt = ((sp.get('st') ?? sp.get('share') ?? '').trim().length > 0)
  const {isSignedIn} = useAuth()

  const purchaseAttention =
    checkout === 'success' && !isSignedIn ? 'Payment confirmed – sign in to access your purchased content.' : null

  const derivedAttentionMessage =
    attentionMessage ??
    purchaseAttention ??
    (p.shouldShowTopbarBlockMessage ? (p.lastError ?? null) : null)

  const spotlightAttention = !!derivedAttentionMessage

  const qAlbum = sp.get('album')
  const qTrack = sp.get('track')

  const rawP = normalizeP(sp.get('p') ?? sp.get('panel') ?? 'player')
  const legacyPt = (sp.get('pt') ?? '').trim() || null

  const effectiveP = rawP === LEGACY_PORTAL_P ? (legacyPt ?? DEFAULT_PORTAL_TAB) : rawP
  const isPlayer = effectiveP === 'player'
  const portalTabId = isPlayer ? null : effectiveP

  const qAutoplay = getAutoplayFlag(sp)
  const qShareToken = sp.get('st') ?? sp.get('share') ?? null

  const patchQuery = React.useCallback((patch: Record<string, string | null | undefined>) => {
    replaceQuery(patch)
  }, [])

  React.useEffect(() => {
    const curP = (sp.get('p') ?? '').trim()
    const curPt = (sp.get('pt') ?? '').trim()

    if (curP === LEGACY_PORTAL_P) {
      patchQuery({p: curPt || DEFAULT_PORTAL_TAB, pt: null, panel: null})
      return
    }

    if (curPt && (!curP || curP === '')) {
      patchQuery({p: curPt, pt: null, panel: null})
      return
    }

    if (curPt && curP === 'player') {
      patchQuery({pt: null})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (isPlayer) return
    if (portalTabId) setLastPortalTab(portalTabId)
  }, [isPlayer, portalTabId])

  const forceSurface = React.useCallback(
    (surface: 'player' | 'portal', tabId?: string | null) => {
      const desiredP =
        surface === 'player'
          ? 'player'
          : tabId ?? getLastPortalTab() ?? portalTabId ?? legacyPt ?? DEFAULT_PORTAL_TAB

      const curP = normalizeP(sp.get('p') ?? sp.get('panel') ?? 'player')
      const curEffective = curP === LEGACY_PORTAL_P ? (legacyPt ?? DEFAULT_PORTAL_TAB) : curP
      if (curEffective === desiredP) return

      if (surface === 'player') {
        patchQuery({
          p: 'player',
          panel: null,
          pt: null,
          post: null,
          autoplay: null,
        })
        return
      }

      patchQuery({
        p: desiredP,
        panel: null,
        pt: null,
        album: null,
        track: null,
        t: null,
        autoplay: null,
      })
    },
    [patchQuery, sp, portalTabId, legacyPt]
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
        panel: null,
        pt: null,
        post: null,
        album: slug,
        track: null,
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
    if (isPlayer) return
    if (qAlbum || qTrack || sp.get('t') || sp.get('autoplay')) {
      patchQuery({album: null, track: null, t: null, autoplay: null})
    }
  }, [isPlayer, qAlbum, qTrack, sp, patchQuery])

  React.useEffect(() => {
    if (!isPlayer) return
    if (!qTrack) return
    p.selectTrack(qTrack)
    p.setPendingTrackId(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayer, qTrack])

  const autoplayFiredRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!isPlayer) return
    if (!qAutoplay) return
    if (!qTrack) return

    if (!qShareToken) {
      patchQuery({autoplay: null})
      return
    }

    const key = `${qAlbum ?? ''}:${qTrack}:${qShareToken}`
    if (autoplayFiredRef.current === key) return
    autoplayFiredRef.current = key

    p.play()
    patchQuery({autoplay: null})
  }, [isPlayer, qAutoplay, qTrack, qAlbum, qShareToken, p, patchQuery])

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

  // Anchor that defines the *exact* place the user expects the spotlight UI to live.
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

  const msgNode = <MessageBar checkout={checkout} attentionMessage={derivedAttentionMessage} />

  return (
    <>
      {/* Blur+block EVERYTHING else (including MiniPlayer). */}
      <SpotlightVeil active={spotlightAttention} />

      {/* Clone the spotlight UI ABOVE the veil, but at the exact same on-screen position. */}
      <SpotlightClone active={spotlightAttention} anchorRect={spotlightRect}>
        <div style={{pointerEvents: 'auto'}}>
          {gateNode}
          {msgNode}
        </div>
      </SpotlightClone>

      <QueueBootstrapper
        albumId={hasSt ? (album?.catalogId ?? null) : (album?.catalogId ?? album?.id ?? null)}
        tracks={tracks}
      />

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
                      {/* Anchor defines the exact visual location; when spotlight is active we hide in-place UI
                          but keep layout identical, and render the interactive clone above the veil. */}
                      <div
                        ref={spotlightAnchorRef}
                        style={{
                          // Keep it in the normal flow always.
                          position: 'relative',
                          // While spotlighting, keep layout but hide visuals + block clicks.
                          visibility: spotlightAttention ? 'hidden' : 'visible',
                          pointerEvents: spotlightAttention ? 'none' : 'auto',
                        }}
                      >
                        {gateNode}
                        {msgNode}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        />

        {/* Persistent mini player stays mounted, but is blurred+blocked by SpotlightVeil when spotlightAttention is true. */}
        <MiniPlayerHost onExpand={() => forceSurface('player')} />
      </div>
    </>
  )
}
