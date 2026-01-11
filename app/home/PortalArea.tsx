// web/app/home/PortalArea.tsx
'use client'

import React from 'react'
import PortalShell, {PortalPanelSpec} from './PortalShell'

import {usePlayer} from '@/app/home/player/PlayerState'
import type {PlayerTrack, AlbumInfo, AlbumNavItem} from '@/lib/types'
import PlayerController from './player/PlayerController'

import ActivationGate from '@/app/home/ActivationGate'
import SubscribeButton from '@/app/home/SubscribeButton'
import CancelSubscriptionButton from '@/app/home/CancelSubscriptionButton'
import Image from 'next/image'


function QueueBootstrapper(props: {albumId: string | null; tracks: PlayerTrack[]}) {
  const p = usePlayer()

  React.useEffect(() => {
    if (p.queue.length > 0) return
    if (!props.tracks.length) return
    p.setQueue(props.tracks)
  }, [p, props.tracks])

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

function CheckoutBanner(props: {checkout: string | null}) {
  const {checkout} = props
  if (checkout !== 'success' && checkout !== 'cancel') return null
  const isSuccess = checkout === 'success'

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.14)',
        background: isSuccess ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.20)',
        padding: '10px 12px',
        fontSize: 12,
        opacity: isSuccess ? 0.9 : 0.85,
        lineHeight: 1.45,
        textAlign: 'left',
        maxWidth: 520,
      }}
    >
      {isSuccess ? (
        <>
          ✅ Checkout completed. If entitlements haven&apos;t appeared yet, refresh once (webhooks can be a
          beat behind).
        </>
      ) : (
        <>Checkout cancelled.</>
      )}
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
  loggedIn?: boolean
  hasGold?: boolean
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
    loggedIn = false,
    hasGold = false,
    canManageBilling = false,
  } = props

  const [activePanelId, setActivePanelId] = React.useState<string>('player')

  const [album, setAlbum] = React.useState<AlbumInfo | null>(initialAlbum)
  const [tracks, setTracks] = React.useState<PlayerTrack[]>(initialTracks)
  const [isBrowsingAlbum, setIsBrowsingAlbum] = React.useState(false)

  React.useEffect(() => {
    setAlbum(initialAlbum)
    setTracks(initialTracks)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAlbum?.id, initialTracks.length])

  const onSelectAlbum = React.useCallback(
    async (slug: string) => {
      if (!slug) return
      if (isBrowsingAlbum) return

      setIsBrowsingAlbum(true)
      try {
        const res = await fetch(`/api/albums/${encodeURIComponent(slug)}`, {method: 'GET'})
        if (!res.ok) throw new Error(`Album fetch failed (${res.status})`)
        const json = (await res.json()) as AlbumPayload

        setAlbum(json.album ?? null)
        setTracks(Array.isArray(json.tracks) ? json.tracks : [])
        setActivePanelId('player')
      } catch (e) {
        console.error(e)
      } finally {
        setIsBrowsingAlbum(false)
      }
    },
    [isBrowsingAlbum]
  )

  const panels = React.useMemo<PortalPanelSpec[]>(
    () => [
      {
        id: 'player',
        label: 'Player',
        content: (
          <PlayerController
            albumSlug={albumSlug}
            album={album}
            tracks={tracks}
            albums={albums}
            onSelectAlbum={onSelectAlbum}
            isBrowsingAlbum={isBrowsingAlbum}
            activePanelId={activePanelId}
            playerPanelId="player"
            openPlayerPanel={() => setActivePanelId('player')}
          />
        ),
      },
      {id: 'portal', label: 'Portal', content: portalPanel},
    ],
    [portalPanel, albumSlug, album, tracks, albums, activePanelId, isBrowsingAlbum, onSelectAlbum]
  )

  return (
    <>
      <QueueBootstrapper albumId={album?.id ?? null} tracks={tracks} />

      <div style={{height: '100%', minHeight: 0, minWidth: 0, display: 'grid'}}>
        <PortalShell
          panels={panels}
          defaultPanelId="player"
          activePanelId={activePanelId}
          syncToQueryParam
          onPanelChange={setActivePanelId}
          headerPortalId="af-portal-topbar-slot"
          header={({activePanelId, setPanel}) => (
  <div
    style={{
        width: '100%',
        borderRadius: 0,
        border: 'none',
        background: 'transparent',
        padding: 12,
        minWidth: 0,
}}
  >
    <style>{`
  /* ---------- Base layout (desktop/tablet) ---------- */
  .afTopBar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .afTopBarLeft,
  .afTopBarRight {
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .afTopBarLeft { justify-content: flex-start; gap: 10px; }
  .afTopBarRight { justify-content: flex-end; }

  .afTopBarLogo {
    min-width: 0;
    display: grid;
    place-items: center;
    padding: 6px 0;
  }

  .afTopBarLogoInner {
    width: fit-content;
    display: grid;
    place-items: center;
  }

  /* ---------- Mobile: 3 explicit rows ---------- */
  @media (max-width: 720px) {
    .afTopBar {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto; /* logo / buttons / actions */
      gap: 12px;
      justify-items: stretch;
      align-items: start;
    }

    /* Row 1: logo gets full-width breathing space */
    .afTopBarLogo {
      grid-row: 1;
      grid-column: 1 / -1;
      justify-self: stretch;
      width: 100%;
      padding: 12px 0 4px;
    }

    /* Row 2: buttons */
    .afTopBarLeft {
      grid-row: 2;
      justify-self: start;
    }

    /* Row 3: actions (ActivationGate + banner) */
    .afTopBarRight {
      grid-row: 3;
      justify-self: stretch;
      width: 100%;
    }

    .afTopBarRightInner {
      margin-left: auto; /* keep the actions visually right-aligned */
      max-width: 520px;
    }
  }
`}</style>



    <div className="afTopBar">
      {/* Left: circular panel buttons */}
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
          {/* keep your SVG IconPlayer() here */}
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

     {/* Center: logo (image if set, else fallback badge) */}
        <div className="afTopBarLogo">
  <div className="afTopBarLogoInner">
    {props.topLogoUrl ? (
      <Image
        src={props.topLogoUrl}
        alt="Logo"
        height={Math.max(16, Math.min(120, props.topLogoHeight ?? 38))}
        width={Math.max(16, Math.min(120, props.topLogoHeight ?? 38))} // stop lying about width
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


      {/* Right: ActivationGate */}
      <div className="afTopBarRight">
        <div className="afTopBarRightInner" style={{maxWidth: 520, minWidth: 0}}>
          <ActivationGate attentionMessage={attentionMessage}>
            <div style={{display: 'grid', justifyItems: 'center', gap: 10}}>
              {canManageBilling ? (
                <>
                  {!hasGold ? <SubscribeButton loggedIn={loggedIn} /> : null}
                  {hasGold ? <CancelSubscriptionButton /> : null}
                </>
              ) : null}
            </div>
          </ActivationGate>

          <CheckoutBanner checkout={checkout} />
        </div>
      </div>
    </div>
  </div>
)}

        />
      </div>
    </>
  )
}
