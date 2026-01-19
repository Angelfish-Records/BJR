// web/app/home/PortalArea.tsx
'use client'

import React from 'react'
import {useAuth} from '@clerk/nextjs'
import PortalShell, {PortalPanelSpec} from './PortalShell'
import {useClientSearchParams, replaceQuery, getAutoplayFlag} from './urlState'
import {usePlayer} from '@/app/home/player/PlayerState'
import type {PlayerTrack, AlbumInfo, AlbumNavItem, Tier} from '@/lib/types'
import PlayerController from './player/PlayerController'

import ActivationGate from '@/app/home/ActivationGate'
import Image from 'next/image'

function QueueBootstrapper(props: {albumId: string | null; tracks: PlayerTrack[]}) {
  const p = usePlayer()

  React.useEffect(() => {
    if (p.queue.length > 0) return
    if (!props.tracks.length) return

    p.setQueue(props.tracks, {contextId: props.albumId ?? undefined})
  }, [p, p.queue.length, props.albumId, props.tracks])

  return null
}


type AlbumPayload = {album: AlbumInfo | null; tracks: PlayerTrack[]}

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
  checkout === 'success' && !isSignedIn
    ? 'Payment confirmed – sign in to access your purchased content.'
    : null

  const derivedAttentionMessage =
    attentionMessage ??
    purchaseAttention ??
    (p.status === 'blocked' &&
    (p.blockedCode === 'ANON_CAP_REACHED' ||
      p.blockedCode === 'ENTITLEMENT_REQUIRED' ||
      p.blockedCode === 'AUTH_REQUIRED')
      ? p.lastError ?? null
      : null)

  const spotlightAttention = !!derivedAttentionMessage


  const qAlbum = sp.get('album')
  const qTrack = sp.get('track')
  const qPanel = sp.get('p') ?? sp.get('panel') ?? 'player'

  // Futureproofing: explicit opt-in autoplay flag.
  const qAutoplay = getAutoplayFlag(sp)

  // Optional: require a “trusted” token so random links can’t force autoplay.
  // If you don’t have this yet, leave it: autoplay simply won’t trigger even if autoplay=1 is present.
  const qShareToken = sp.get('st') ?? sp.get('share') ?? null

  // single writer (NO Next navigation)
  const patchQuery = React.useCallback((patch: Record<string, string | null | undefined>) => {
    replaceQuery(patch)
  }, [])

  const forcePanel = React.useCallback(
    (id: 'player' | 'portal') => {
      const cur = sp.get('p') ?? sp.get('panel')
      if (cur === id) return

      if (id === 'portal') {
        patchQuery({
          p: 'portal',
          album: null,
          track: null,
          t: null,
          autoplay: null, // don’t carry it into portal
        })
      } else {
        patchQuery({p: 'player'})
      }
    },
    [patchQuery, sp]
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

      patchQuery({p: 'player', album: slug, track: null, st: null, share: null})

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

  // ✅ URL-driven bootstrap (canonical addressing)
  React.useEffect(() => {
    if (qPanel !== 'player') return
    if (!qAlbum) return
    if (qAlbum !== currentAlbumSlug) void onSelectAlbum(qAlbum)
  }, [qPanel, qAlbum, currentAlbumSlug, onSelectAlbum])

  React.useEffect(() => {
    if (qPanel !== 'portal') return
    if (qAlbum || qTrack || sp.get('t') || sp.get('autoplay')) {
      patchQuery({album: null, track: null, t: null, autoplay: null})
    }
  }, [qPanel, qAlbum, qTrack, sp, patchQuery])

  // Select track from URL (select-only)
  React.useEffect(() => {
    if (qPanel !== 'player') return
    if (!qTrack) return
    p.selectTrack(qTrack)
    p.setPendingTrackId(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qPanel, qTrack])

  // Futureproofing: opt-in autoplay (one-shot)
  const autoplayFiredRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (qPanel !== 'player') return
    if (!qAutoplay) return
    if (!qTrack) return

    // Require a “trusted” token so autoplay can’t be triggered by random links.
    // If/when you introduce a real share token, wire it to `st=...` and this starts working.
    if (!qShareToken) {
      // Don’t keep an inert autoplay param around forever.
      patchQuery({autoplay: null})
      return
    }

    const key = `${qAlbum ?? ''}:${qTrack}:${qShareToken}`
    if (autoplayFiredRef.current === key) return
    autoplayFiredRef.current = key

    // Important: request play via PlayerState only.
    p.play()

    // Make it one-shot so it can’t re-trigger on qs changes / re-renders.
    patchQuery({autoplay: null})
  }, [qPanel, qAutoplay, qTrack, qAlbum, qShareToken, p, patchQuery])

  // Existing: MiniPlayer -> open player + optional album request
  React.useEffect(() => {
    const onOpen = (ev: Event) => {
      const e = ev as CustomEvent<{albumSlug?: string | null}>
      const slug = e.detail?.albumSlug ?? null
      forcePanel('player')
      if (slug) void onSelectAlbum(slug)
    }

    window.addEventListener('af:open-player', onOpen as EventListener)
    return () => window.removeEventListener('af:open-player', onOpen as EventListener)
  }, [onSelectAlbum, forcePanel])

  const viewerTier: Tier = (tier === 'friend' || tier === 'patron' || tier === 'partner' ? tier : 'none')

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
            openPlayerPanel={() => forcePanel('player')}
            viewerTier={viewerTier}
          />
        ),
      },
      {id: 'portal', label: 'Portal', content: portalPanel},
    ],
    [portalPanel, currentAlbumSlug, album, tracks, albums, forcePanel, isBrowsingAlbum, onSelectAlbum, viewerTier]
  )

  return (
    <>
      <QueueBootstrapper
        albumId={hasSt ? (album?.catalogId ?? null) : (album?.catalogId ?? album?.id ?? null)}
        tracks={tracks}
      />

      <div style={{height: '100%', minHeight: 0, minWidth: 0, display: 'grid'}}>
        <PortalShell
          panels={panels}
          defaultPanelId="player"
          syncToQueryParam
          headerPortalId="af-portal-topbar-slot"
          // --- inside <PortalShell ... header={({activePanelId, setPanel}) => ( ... )} ---
// (wrap header in a relative container; add blur overlay when spotlightAttention;
//  lift ActivationGate above the overlay)

header={({activePanelId, setPanel}) => (
  <div
    style={{
      width: '100%',
      borderRadius: 0,
      border: 'none',
      background: 'transparent',
      padding: 12,
      minWidth: 0,
      position: 'relative', // ✅ allow overlay
    }}
  >
    {/* ✅ Spotlight blur overlay: blurs everything in header except the gate (which we lift above it) */}
    {spotlightAttention ? (
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 10,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          background: 'rgba(0,0,0,0.18)',
        }}
      />
    ) : null}

    <style>{`
/* ---------- Desktop/tablet: single-row, 3 lanes ---------- */
.afTopBar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  grid-template-rows: 1fr;
  align-items: stretch;
  gap: 12px;
  min-width: 0;
}

.afTopBarControls { display: contents; }

.afTopBarLeft {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 10px;
  align-self: stretch;
}

.afTopBarLogo {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 6px 0 2px;
  align-self: stretch;
}

.afTopBarLogoInner {
  width: fit-content;
  display: grid;
  place-items: end center;
}

.afTopBarRight {
  grid-column: 3;
  grid-row: 1;
  min-width: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  align-self: stretch;
}

.afTopBarRightInner {
  max-width: 520px;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

/* ---------- Mobile: logo row + nested controls row ---------- */
@media (max-width: 720px) {
  .afTopBar {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    gap: 10px;
    align-items: stretch;
    justify-items: stretch;
  }

  .afTopBarLogo {
    grid-row: 1;
    grid-column: 1 / -1;
    width: 100%;
    padding: 10px 0 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .afTopBarControls {
    grid-row: 2;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: stretch;
    column-gap: 10px;
    row-gap: 0px;
    width: 100%;
    min-width: 0;
  }

  .afTopBarLeft {
    grid-column: 1;
    justify-self: start;
    display: flex;
    align-items: flex-end;
    align-self: stretch;
  }

  .afTopBarRight {
    grid-column: 2;
    justify-self: end;
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    align-self: stretch;
  }

  .afTopBarRightInner {
    margin-left: auto;
    max-width: 520px;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
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
            onClick={() => setPanel('player')}
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
              background:
                activePanelId === 'player'
                  ? 'color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))'
                  : 'rgba(255,255,255,0.04)',
              boxShadow:
                activePanelId === 'player'
                  ? '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)'
                  : '0 12px 26px rgba(0,0,0,0.18)',
              color: 'rgba(255,255,255,0.90)',
              cursor: 'pointer',
              opacity: activePanelId === 'player' ? 0.98 : 0.78,
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
            onClick={() => setPanel('portal')}
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
              background:
                activePanelId === 'portal'
                  ? 'color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))'
                  : 'rgba(255,255,255,0.04)',
              boxShadow:
                activePanelId === 'portal'
                  ? '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)'
                  : '0 12px 26px rgba(0,0,0,0.18)',
              color: 'rgba(255,255,255,0.90)',
              cursor: 'pointer',
              opacity: activePanelId === 'portal' ? 0.98 : 0.78,
              display: 'grid',
              placeItems: 'center',
              userSelect: 'none',
            }}
          >
            <IconPortal />
          </button>
        </div>

        <div className="afTopBarRight">
          {/* ✅ lift gate above blur overlay */}
          <div className="afTopBarRightInner" style={{maxWidth: 520, minWidth: 0, position: 'relative', zIndex: 20}}>
            <ActivationGate
              attentionMessage={derivedAttentionMessage}
              canManageBilling={canManageBilling}
              isPatron={isPatron}
              tier={tier}
            >
              <div />
            </ActivationGate>
          </div>
        </div>
      </div>
    </div>

    {/* MessageBar should ALSO be above blur overlay (so text is crisp) */}
    <div style={spotlightAttention ? {position: 'relative', zIndex: 20} : undefined}>
      <MessageBar checkout={checkout} attentionMessage={derivedAttentionMessage} />
    </div>
  </div>
)}

        />
      </div>
    </>
  )
}
