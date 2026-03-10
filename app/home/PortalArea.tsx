// web/app/home/PortalArea.tsx
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import PortalShell, { PortalPanelSpec } from "./PortalShell";
import {
  useClientSearchParams,
  replaceQuery,
  getAutoplayFlag,
} from "./urlState";
import { getLastPortalTab } from "./portalLastTab";
import { usePlayer } from "@/app/home/player/PlayerState";
import { useGlobalTransportKeys } from "./player/useGlobalTransportKeys";
import type { AlbumNavItem, Tier, AlbumPlayerBundle } from "@/lib/types";
import PlayerController from "./player/PlayerController";
import ActivationGate from "@/app/home/ActivationGate";
import { PortalViewerProvider } from "@/app/home/PortalViewerProvider";
import { useGateBroker } from "@/app/home/gating/GateBroker";
import GateSpotlightOverlay from "@/app/home/gating/GateSpotlightOverlay";
import MiniPlayerHost from "./MiniPlayerHost";
import SessionChrome from "./SessionChrome";

// --- SURFACE: path-only (NO ?p= fallback) ---

const DEFAULT_PORTAL_TAB = "portal";

// Keep aligned with middleware + returnTo.
const RESERVED_ROOTS = new Set<string>([
  "portal",
  "journal",
  "posts",
  "extras",
  "download",
  "player",
  "gift",
  "unsubscribe",
  "studio",
  "admin",
  "api",
  "exegesis",
]);

function splitPath(pathname: string | null): string[] {
  return (pathname ?? "").split("?")[0]!.split("/").filter(Boolean);
}

/**
 * Portal tabs are now only allowed on known/reserved roots.
 * Everything else at /:slug(/:displayId) is treated as music.
 */
function portalTabFromPathname(pathname: string | null): string | null {
  const parts = splitPath(pathname);
  const headRaw = (parts[0] ?? "").trim();
  if (!headRaw) return null;

  let head = headRaw.toLowerCase();
  try {
    head = decodeURIComponent(head).trim().toLowerCase();
  } catch {}

  if (!head) return null;
  if (head === "player") return null; // system route, never a portal tab
  if (!RESERVED_ROOTS.has(head)) return null;
  return head;
}

function parsePublicAlbumPath(pathname: string | null): {
  albumSlug: string | null;
  displayId: string | null;
} {
  const parts = splitPath(pathname);

  // canonical music surfaces:
  // /:slug
  // /:slug/:displayId
  if (parts.length === 0 || parts.length > 2) {
    return { albumSlug: null, displayId: null };
  }

  const slugRaw = (parts[0] ?? "").trim();
  if (!slugRaw) return { albumSlug: null, displayId: null };

  // If it’s a reserved/system root, it’s not music.
  const lowered = (() => {
    try {
      return decodeURIComponent(slugRaw).trim().toLowerCase();
    } catch {
      return slugRaw.trim().toLowerCase();
    }
  })();

  if (!lowered || RESERVED_ROOTS.has(lowered)) {
    return { albumSlug: null, displayId: null };
  }

  const albumSlug = (() => {
    try {
      return decodeURIComponent(slugRaw).trim() || null;
    } catch {
      return slugRaw.trim() || null;
    }
  })();

  const displayId = (() => {
    const raw = (parts[1] ?? "").trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw).trim() || null;
    } catch {
      return raw.trim() || null;
    }
  })();

  return { albumSlug, displayId };
}

function getSavedSt(slug: string): string {
  try {
    return (sessionStorage.getItem(`af_st:${slug}`) ?? "").trim();
  } catch {
    return "";
  }
}

function setSavedSt(slug: string, st: string) {
  try {
    sessionStorage.setItem(`af_st:${slug}`, st);
  } catch {}
}

export type PortalAreaProps = {
  portalPanel: React.ReactNode;
  topLogoUrl?: string | null;
  topLogoHeight?: number | null;
  initialPortalTabId?: string | null;
  initialExegesisDisplayId?: string | null;
  bundle: AlbumPlayerBundle;
  albums: AlbumNavItem[];
  attentionMessage?: string | null;
  tier?: string | null;
  isPatron?: boolean;
  // isAdmin is owned at /(site)/layout.tsx via AdminRibbon.
  // PortalArea should not take it as input.
  canManageBilling?: boolean;
};

export default function PortalArea(props: PortalAreaProps) {
  const {
    portalPanel,
    bundle,
    albums,
    attentionMessage = null,
    tier = null,
    isPatron = false,
    canManageBilling = false,
  } = props;

  const p = usePlayer();
  const { setQueue, play, selectTrack, setPendingRecordingId } = p;
  useGlobalTransportKeys(p, { enabled: true });
  const sp = useClientSearchParams();
  const { isSignedIn: isSignedInRaw } = useAuth();

  const isSignedIn = Boolean(isSignedInRaw);

  const router = useRouter();
  const pathname = usePathname();

  const route = React.useMemo(() => parsePublicAlbumPath(pathname), [pathname]);
  const isMusicRoute = Boolean(route.albumSlug);

  const pathTab = portalTabFromPathname(pathname);

  // Player surface is any /:slug(/:displayId) that is NOT a reserved root.
  const isPlayer = isMusicRoute;
  const portalTabId = !isPlayer ? pathTab : null;

  // --- Optimistic surface flip (optional polish) ---
  const [optimisticSurface, setOptimisticSurface] = React.useState<
    "player" | "portal" | null
  >(null);

  // Clear optimistic state once the URL agrees with reality.
  React.useEffect(() => {
    if (!optimisticSurface) return;
    const reality = isPlayer ? "player" : "portal";
    if (reality === optimisticSurface) setOptimisticSurface(null);
  }, [optimisticSurface, isPlayer]);

  const effectiveIsPlayer =
    optimisticSurface != null ? optimisticSurface === "player" : isPlayer;

  // --- two-signal model for differential Exegesis portal styling ---

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    root.dataset.afSurface = effectiveIsPlayer ? "player" : "portal";

    return () => {
      // cleanup on unmount
      delete root.dataset.afSurface;
    };
  }, [effectiveIsPlayer]);

  // Base album slug to use when jumping "to player" from a portal tab.
  // (On portal routes route.albumSlug is null, so we fall back to the shell’s current albumSlug prop.)
  const playerAlbumSlug = route.albumSlug ?? bundle.albumSlug;

  // --- Prefetch player/portal surfaces so Player↔Portal flips feel like tab switches ---
  const buildSecondaryForNav = React.useCallback(() => {
    // Use the sanitized secondary query from urlState (sp).
    return new URLSearchParams(sp.toString());
  }, [sp]);

  function buildSurfaceHref(
    secondary: URLSearchParams,
    opts: {
      toPlayer?: boolean;
      tab?: string | null;
      clearPosts?: boolean;
      albumSlugForPlayer: string;
    },
  ) {
    const next = new URLSearchParams(secondary.toString());

    // strip legacy/state keys (should already be sanitized, but belt + braces)
    for (const k of ["p", "panel", "album", "track", "t"]) next.delete(k);

    // if leaving posts, clear post params
    if (opts.clearPosts) {
      next.delete("post");
      next.delete("pt");
    }

    const base = opts.toPlayer
      ? `/${encodeURIComponent(opts.albumSlugForPlayer)}`
      : `/${encodeURIComponent(opts.tab ?? DEFAULT_PORTAL_TAB)}`;

    const q = next.toString();
    return q ? `${base}?${q}` : base;
  }

  const hrefToPlayer = React.useMemo(() => {
    const secondary = buildSecondaryForNav();
    return buildSurfaceHref(secondary, {
      toPlayer: true,
      clearPosts: false, // prefetch doesn't need exact post-clearing semantics
      albumSlugForPlayer: playerAlbumSlug,
    });
  }, [buildSecondaryForNav, playerAlbumSlug]);

  const hrefToPortal = React.useMemo(() => {
    const secondary = buildSecondaryForNav();
    const desired =
      (getLastPortalTab() ?? portalTabId ?? DEFAULT_PORTAL_TAB) ||
      DEFAULT_PORTAL_TAB;

    return buildSurfaceHref(secondary, {
      toPlayer: false,
      tab: desired,
      clearPosts: false,
      albumSlugForPlayer: playerAlbumSlug,
    });
  }, [buildSecondaryForNav, portalTabId, playerAlbumSlug]);

  const prefetchPlayer = React.useCallback(() => {
    try {
      router.prefetch(hrefToPlayer);
    } catch {}
  }, [router, hrefToPlayer]);

  const prefetchPortal = React.useCallback(() => {
    try {
      router.prefetch(hrefToPortal);
    } catch {}
  }, [router, hrefToPortal]);

  const patchQuery = React.useCallback(
    (patch: Record<string, string | null | undefined>) => {
      // Query is secondary everywhere.
      // Allow ONLY: st/share, autoplay, utm_*, plus banner keys if we still use them.
      const filtered: Record<string, string | null | undefined> = {};

      for (const [k, v] of Object.entries(patch)) {
        if (
          k === "st" ||
          k === "share" ||
          k === "autoplay" ||
          k === "gift" ||
          k === "checkout" ||
          k === "post" ||
          k === "pt" ||
          k.startsWith("utm_")
        ) {
          filtered[k] = v;
        }
      }

      if (Object.keys(filtered).length) replaceQuery(filtered);
    },
    [],
  );

  const forceSurface = React.useCallback(
    (
      surface: "player" | "portal",
      tabId?: string | null,
      mode: "push" | "replace" = "push",
    ) => {
      const leavingPosts = (portalTabId ?? "").toLowerCase() === "journal";

      // Use the sanitized secondary query from urlState.
      const secondary = new URLSearchParams(sp.toString());

      if (surface === "player") {
        const href = buildSurfaceHref(secondary, {
          toPlayer: true,
          clearPosts: leavingPosts,
          albumSlugForPlayer: playerAlbumSlug,
        });
        if (mode === "replace") router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
        return;
      }

      const desired =
        (tabId ?? getLastPortalTab() ?? portalTabId ?? DEFAULT_PORTAL_TAB) ||
        DEFAULT_PORTAL_TAB;

      const href = buildSurfaceHref(secondary, {
        toPlayer: false,
        tab: desired,
        clearPosts: leavingPosts && desired !== "journal",
        albumSlugForPlayer: playerAlbumSlug, // unused in this branch, but keeps signature uniform
      });

      if (mode === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [router, sp, portalTabId, playerAlbumSlug],
  );

  const gift = (sp.get("gift") ?? "").trim() || null;
  const checkout = (sp.get("checkout") ?? "").trim() || null;

  const bannerKey = React.useMemo(() => {
    if (gift) return `gift:${gift}`;
    if (checkout) return `checkout:${checkout}`;
    return "";
  }, [gift, checkout]);

  const dismissedKeyRef = React.useRef<string>("");
  const [bannerDismissed, setBannerDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!bannerKey) {
      setBannerDismissed(false);
      dismissedKeyRef.current = "";
      return;
    }
    if (dismissedKeyRef.current !== bannerKey) setBannerDismissed(false);
  }, [bannerKey]);

  const dismissBanner = React.useCallback(() => {
    if (!bannerKey) return;
    dismissedKeyRef.current = bannerKey;
    setBannerDismissed(true);
    if (gift) replaceQuery({ gift: null });
    if (checkout) replaceQuery({ checkout: null });
  }, [bannerKey, gift, checkout]);

  // dismiss banner when surface/tab changes (player <-> portal or portal tab changes)
  const lastSurfaceKeyRef = React.useRef<string>(
    `${isPlayer ? "player" : `portal:${portalTabId ?? ""}`}`,
  );

  React.useEffect(() => {
    const key = `${isPlayer ? "player" : `portal:${portalTabId ?? ""}`}`;
    const prev = lastSurfaceKeyRef.current;
    if (prev !== key) {
      lastSurfaceKeyRef.current = key;
      if (!bannerDismissed && bannerKey) dismissBanner();
    }
  }, [isPlayer, portalTabId, bannerDismissed, bannerKey, dismissBanner]);

  const { gate: brokerGate } = useGateBroker();

  const brokerAttentionMessage = brokerGate.active?.message?.trim()
    ? brokerGate.active.message
    : null;

  // PortalArea is now broker-driven for gating presentation.
  // PlayerState may still hold transport safety state, but it must not drive UI gating.
  const derivedAttentionMessage =
    attentionMessage ?? brokerAttentionMessage ?? null;

  const qAlbum = (isPlayer ? route.albumSlug : null) ?? null;
  const qDisplayId = (isPlayer ? route.displayId : null) ?? null;

  // Resolve URL displayId -> internal recordingId (best-effort).
  const qTrackRecordingId = React.useMemo(() => {
    if (!qDisplayId) return null;
    const hit = (bundle.tracks ?? []).find((t) => t.displayId === qDisplayId);
    return hit?.recordingId ?? null;
  }, [qDisplayId, bundle.tracks]);

  // Secondary concerns stay query-based (allowed everywhere)
  const qAutoplay = getAutoplayFlag(sp);
  const qShareToken = (sp.get("st") ?? sp.get("share") ?? "").trim() || null;
  const hasSt = Boolean(qShareToken);

  const spotlightAttention =
    !!derivedAttentionMessage &&
    brokerGate.uiMode === "spotlight" &&
    !isSignedIn;

  const forcedPlayerRef = React.useRef(false);
  React.useEffect(() => {
    if (forcedPlayerRef.current) return;

    const playbackIntent = Boolean(qDisplayId) || Boolean(qAutoplay);
    if (!playbackIntent) return;

    // already on /album/... (player surface)
    if (isPlayer) {
      forcedPlayerRef.current = true;
      return;
    }

    forcedPlayerRef.current = true;
    forceSurface("player", null, "replace");
  }, [qDisplayId, qAutoplay, isPlayer, forceSurface]);

  const currentAlbumSlug = bundle.albumSlug;
  const album = bundle.album;
  const tracks = bundle.tracks;
  const isBrowsingAlbum = false;

  const onSelectAlbum = React.useCallback(
    (slug: string) => {
      if (!slug) return;

      const out = new URLSearchParams();

      // 1) carry forward allowed params from the current URL first
      try {
        const cur = new URLSearchParams(window.location.search);

        const st = (cur.get("st") ?? "").trim();
        const share = (cur.get("share") ?? "").trim();
        const autoplay = (cur.get("autoplay") ?? "").trim();

        if (st) out.set("st", st);
        else if (share) out.set("share", share);

        if (autoplay) out.set("autoplay", autoplay);

        for (const [k, v] of cur.entries()) {
          if (k.startsWith("utm_") && v.trim()) out.set(k, v.trim());
        }
      } catch {
        // ignore
      }

      // 2) if we still don't have a token, fall back to per-album saved st
      if (!out.get("st") && !out.get("share")) {
        const saved = getSavedSt(slug);
        if (saved) out.set("st", saved);
      }

      const q = out.toString();
      router.push(`/${encodeURIComponent(slug)}${q ? `?${q}` : ""}`, {
        scroll: false,
      });
    },
    [router],
  );

  React.useEffect(() => {
    if (!qTrackRecordingId) return;
    selectTrack(qTrackRecordingId);
    setPendingRecordingId(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qTrackRecordingId]);

  const primedRef = React.useRef(false);
  React.useEffect(() => {
    // Prime the queue once as soon as we have album+tracks,
    // regardless of which portal surface the user landed on.
    if (primedRef.current) return;
    if (!album || tracks.length === 0) return;

    // If something already exists (restored session, prior nav), don't override it.
    if (p.current || p.queue.length > 0) {
      primedRef.current = true;
      return;
    }

    // If a specific track is requested via URL, let the track-selection effect handle it.
    // (We still need the queue, but we shouldn't force-select first track here.)
    if (qDisplayId) {
      primedRef.current = true;
      return;
    }

    const first = tracks[0];
    if (!first?.recordingId) return;

    const ctxId = hasSt
      ? (album.catalogueId ?? undefined)
      : (album.catalogueId ?? album.id ?? undefined);

    const ctxSlug = qAlbum ?? currentAlbumSlug;

    p.setQueue(tracks, {
      contextId: ctxId,
      contextSlug: ctxSlug,
      contextTitle: album.title ?? undefined,
      contextArtist: album.artist ?? undefined,
      artworkUrl: album.artworkUrl ?? null,
    });

    p.selectTrack(first.recordingId);
    p.setPendingRecordingId(undefined);

    primedRef.current = true;
  }, [album, tracks, hasSt, qAlbum, currentAlbumSlug, qDisplayId, p]);

  const autoplayFiredRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!isPlayer) return;
    if (!qAutoplay) return;
    if (!qTrackRecordingId) return;

    if (!qShareToken) {
      patchQuery({ autoplay: null });
      return;
    }

    if (!album || tracks.length === 0) return;

    const key = `${qAlbum ?? ""}:${qTrackRecordingId}:${qShareToken}`;
    if (autoplayFiredRef.current === key) return;
    autoplayFiredRef.current = key;

    const ctxId = hasSt
      ? (album.catalogueId ?? undefined)
      : (album.catalogueId ?? album.id ?? undefined);
    const ctxSlug = qAlbum ?? currentAlbumSlug;

    setQueue(tracks, {
      contextId: ctxId,
      contextSlug: ctxSlug,
      contextTitle: album.title ?? undefined,
      contextArtist: album.artist ?? undefined,
      artworkUrl: album.artworkUrl ?? null,
    });

    const t = tracks.find((x) => x.recordingId === qTrackRecordingId);
    play(t);
    patchQuery({ autoplay: null });
  }, [
    isPlayer,
    qAutoplay,
    qTrackRecordingId,
    qAlbum,
    qShareToken,
    album,
    tracks,
    hasSt,
    currentAlbumSlug,
    play,
    setQueue,
    patchQuery,
  ]);

  React.useEffect(() => {
    if (!isPlayer) return;

    const slug = qAlbum ?? currentAlbumSlug;
    if (!slug) return;

    const stFromUrl = (sp.get("st") ?? sp.get("share") ?? "").trim();

    if (stFromUrl) {
      setSavedSt(slug, stFromUrl);
      return;
    }

    const saved = getSavedSt(slug);
    if (saved) patchQuery({ st: saved, share: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayer, qAlbum, currentAlbumSlug]);

  React.useEffect(() => {
    const onOpen = (ev: Event) => {
      const e = ev as CustomEvent<{ albumSlug?: string | null }>;
      const slug = e.detail?.albumSlug ?? null;
      if (slug) void onSelectAlbum(slug);
      else forceSurface("player");
    };

    window.addEventListener("af:open-player", onOpen as EventListener);
    return () =>
      window.removeEventListener("af:open-player", onOpen as EventListener);
  }, [onSelectAlbum, forceSurface]);

  const viewerTier: Tier =
    tier === "friend" || tier === "patron" || tier === "partner"
      ? tier
      : "none";

  const tierLower = (tier ?? "").toLowerCase();
  const isPartner = tierLower.includes("partner");

  const panels = React.useMemo<PortalPanelSpec[]>(
    () => [
      {
        id: "player",
        label: "Player",
        content: (
          <PlayerController
            bundle={bundle}
            albums={albums}
            onSelectAlbum={onSelectAlbum}
            isBrowsingAlbum={isBrowsingAlbum}
            openPlayerPanel={() => forceSurface("player")}
            viewerTier={viewerTier}
          />
        ),
      },
      { id: "portal", label: "Portal", content: portalPanel },
    ],
    [
      bundle,
      albums,
      onSelectAlbum,
      isBrowsingAlbum,
      forceSurface,
      viewerTier,
      portalPanel,
    ],
  );

  const gateNodeModal = (
    <ActivationGate
      placement="modal"
      attentionMessage={derivedAttentionMessage}
      canManageBilling={canManageBilling}
      isPatron={isPatron}
      tier={tier}
    >
      <div />
    </ActivationGate>
  );

  const bannerKind: "gift" | "checkout" | null = gift
    ? "gift"
    : checkout
      ? "checkout"
      : null;
  const bannerCode =
    !bannerDismissed && (gift ?? checkout ?? null)
      ? (gift ?? checkout ?? null)
      : null;

  return (
    <>
      {/* ✅ All spotlight overlay mechanics are now owned by GateSpotlightOverlay */}
      <GateSpotlightOverlay
        active={spotlightAttention}
        gateNode={gateNodeModal}
      />

      <div
        style={{ height: "100%", minHeight: 0, minWidth: 0, display: "grid" }}
      >
        <PortalViewerProvider
          initialPortalTabId={props.initialPortalTabId ?? null}
          initialExegesisDisplayId={props.initialExegesisDisplayId ?? null}
          value={{
            viewerTier,
            rawTier: tier,
            isSignedIn,
            isPatron,
            isPartner,
          }}
        >
          <PortalShell
            panels={panels}
            defaultPanelId="player"
            syncToQueryParam={false}
            activePanelId={effectiveIsPlayer ? "player" : "portal"}
            keepMountedPanelIds={["player", "portal"]}
            onPanelChange={(panelId) => {
              if (panelId === "player") forceSurface("player");
              else forceSurface("portal");
            }}
            headerPortalId="af-portal-topbar-slot"
            header={() => (
              <SessionChrome
                topLogoUrl={props.topLogoUrl}
                topLogoHeight={props.topLogoHeight}
                effectiveIsPlayer={effectiveIsPlayer}
                portalTabId={portalTabId}
                spotlightAttention={spotlightAttention}
                attentionMessage={derivedAttentionMessage}
                canManageBilling={canManageBilling}
                isPatron={isPatron}
                tier={tier}
                bannerKind={bannerKind}
                bannerCode={bannerCode}
                onDismissBanner={dismissBanner}
                onPrefetchPlayer={prefetchPlayer}
                onPrefetchPortal={prefetchPortal}
                onOpenPlayer={() => {
                  setOptimisticSurface("player");
                  forceSurface("player");
                }}
                onOpenPortal={(tabId) => {
                  setOptimisticSurface("portal");
                  forceSurface("portal", tabId);
                }}
              />
            )}
          />
        </PortalViewerProvider>
        <MiniPlayerHost onExpand={() => forceSurface("player")} />
      </div>
    </>
  );
}
