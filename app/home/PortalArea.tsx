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
import MiniPlayer from "./player/MiniPlayer";
import ActivationGate from "@/app/home/ActivationGate";
import { PortalViewerProvider } from "@/app/home/PortalViewerProvider";
import { useGateBroker } from "@/app/home/gating/GateBroker";
import GateSpotlightOverlay from "@/app/home/gating/GateSpotlightOverlay";
import Image from "next/image";

// --- SURFACE: path-only (NO ?p= fallback) ---

const DEFAULT_PORTAL_TAB = "portal";

function portalTabFromPathname(pathname: string | null): string | null {
  const p = (pathname ?? "").split("?")[0] ?? "";
  const parts = p.split("/").filter(Boolean);
  const head = (parts[0] ?? "").trim().toLowerCase();
  if (!head) return null;
  if (head === "player") return null;
  if (head === "album") return null;
  return decodeURIComponent(head);
}

function parsePublicAlbumPath(pathname: string | null): {
  albumSlug: string | null;
  trackId: string | null;
} {
  const p = (pathname ?? "").trim();
  const m = p.match(/^\/album\/([^\/?#]+)(?:\/track\/([^\/?#]+))?\/?$/i);
  if (!m) return { albumSlug: null, trackId: null };
  const albumSlug = decodeURIComponent(m[1] ?? "").trim() || null;
  const trackId = decodeURIComponent(m[2] ?? "").trim() || null;
  return { albumSlug, trackId };
}

function MiniPlayerHost(props: { onExpand: () => void }) {
  const { onExpand } = props;
  const p = usePlayer();

  const intent = p.intent;
  const status = p.status;
  const current = p.current;
  const queueLen = p.queue.length;

  const [miniActive, setMiniActive] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("af:miniActive") === "1";
  });

  React.useEffect(() => {
    const shouldActivate =
      intent === "play" ||
      status === "playing" ||
      status === "paused" ||
      Boolean(current) ||
      queueLen > 0;

    if (!miniActive && shouldActivate) {
      setMiniActive(true);
      try {
        window.sessionStorage.setItem("af:miniActive", "1");
      } catch {}
    }
  }, [miniActive, intent, status, current, queueLen]);

  if (!miniActive) return null;
  return (
    <MiniPlayer
      onExpand={onExpand}
      artworkUrl={p.queueContextArtworkUrl ?? null}
    />
  );
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

function IconPlayer() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="afIcon afIconPlayer"
    >
      <path d="M10 7.6L18.2 12L10 16.4V7.6Z" fill="currentColor" />
    </svg>
  );
}

function IconPortal() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="afIcon afIconPortal"
    >
      <path
        d="M12 4.3L4.35 8.05L12 11.8L19.65 8.05L12 4.3Z"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="afPortalTop"
      />
      <path
        d="M4.35 11.05L12 14.75L19.65 11.05"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

type BannerTone = "success" | "neutral" | "warn";

/** Full-width banner under topbar: non-auth flow messages. */
function FullWidthBanner(props: {
  kind: "gift" | "checkout" | null;
  code: string | null;
  onDismiss: () => void;
}) {
  const { kind, code, onDismiss } = props;
  if (!kind || !code) return null;

  let tone: BannerTone = "neutral";
  let text: React.ReactNode = null;

  if (kind === "checkout") {
    if (code === "success") {
      tone = "success";
      text = (
        <>
          Your account has been updated. Thank you for supporting future work on
          this independent platform.
        </>
      );
    } else if (code === "cancel") {
      tone = "neutral";
      text = <>Checkout cancelled.</>;
    } else return null;
  }

  if (kind === "gift") {
    if (code === "ready") {
      tone = "success";
      text = <>Gift activated. Your content is now available.</>;
    } else if (code === "not_paid") {
      tone = "neutral";
      text = (
        <>
          This gift hasn&apos;t completed payment yet. If you just paid, refresh
          in a moment.
        </>
      );
    } else if (code === "wrong_account") {
      tone = "warn";
      text = (
        <>
          This gift was sent to a different email. Sign in with the recipient
          account.
        </>
      );
    } else if (code === "claim_code_missing") {
      tone = "warn";
      text = (
        <>
          That link is missing its claim code. Open the exact link from the
          email.
        </>
      );
    } else if (code === "invalid_claim") {
      tone = "warn";
      text = (
        <>
          That claim code doesn&apos;t match this gift. Open the exact link from
          the email.
        </>
      );
    } else if (code === "missing") {
      tone = "warn";
      text = <>That gift link looks invalid.</>;
    } else return null;
  }

  const toneClasses =
    tone === "success"
      ? "border-emerald-400/30 bg-white/5"
      : tone === "warn"
        ? "border-amber-400/30 bg-white/5"
        : "border-white/10 bg-white/5";

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "mt-3 w-full rounded-xl border p-4 shadow-[0_18px_44px_rgba(0,0,0,0.22)]",
        "text-sm leading-relaxed text-white/85",
        "relative",
        toneClasses,
      ].join(" ")}
    >
      <div className="pr-10">{text}</div>

      <button
        type="button"
        aria-label="Dismiss message"
        onClick={onDismiss}
        className={[
          "absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full",
          "border border-white/10 bg-white/5 text-white/70",
          "hover:bg-white/10 hover:text-white/85",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
        ].join(" ")}
      >
        ×
      </button>
    </div>
  );
}

export default function PortalArea(props: {
  portalPanel: React.ReactNode;
  topLogoUrl?: string | null;
  topLogoHeight?: number | null;
  initialPortalTabId?: string | null;
  initialExegesisTrackId?: string | null;
  bundle: AlbumPlayerBundle;
  albums: AlbumNavItem[];
  attentionMessage?: string | null;
  tier?: string | null;
  isPatron?: boolean;
  // isAdmin is owned at /(site)/layout.tsx via AdminDebugBar.
  // PortalArea should not take it as input.
  canManageBilling?: boolean;
}) {
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
  const { setQueue, play, selectTrack, setPendingTrackId } = p;
  useGlobalTransportKeys(p, { enabled: true });
  const sp = useClientSearchParams();
  const { isSignedIn: isSignedInRaw } = useAuth();

  const isSignedIn = Boolean(isSignedInRaw);

  const router = useRouter();
  const pathname = usePathname();

  const route = React.useMemo(() => parsePublicAlbumPath(pathname), [pathname]);
  const isPublicAlbumRoute = Boolean(route.albumSlug);

  const pathTab = portalTabFromPathname(pathname);

  // ✅ Player surface is any /album/:slug(/track/:id) route.
  // Portal surface is /{tab}.
  const isPlayer = isPublicAlbumRoute;
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
      ? `/album/${encodeURIComponent(opts.albumSlugForPlayer)}`
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

  const qAlbum = (isPublicAlbumRoute ? route.albumSlug : null) ?? null;
  const qTrack = (isPublicAlbumRoute ? route.trackId : null) ?? null;

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

    const playbackIntent = Boolean(qTrack) || Boolean(qAutoplay);
    if (!playbackIntent) return;

    // already on /album/... (player surface)
    if (isPlayer) {
      forcedPlayerRef.current = true;
      return;
    }

    forcedPlayerRef.current = true;
    forceSurface("player", null, "replace");
  }, [qTrack, qAutoplay, isPlayer, forceSurface]);

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
      router.push(`/album/${encodeURIComponent(slug)}${q ? `?${q}` : ""}`, {
        scroll: false,
      });
    },
    [router],
  );

  React.useEffect(() => {
    if (!qTrack) return;
    selectTrack(qTrack);
    setPendingTrackId(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qTrack]);

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
    if (qTrack) {
      primedRef.current = true;
      return;
    }

    const first = tracks[0];
    if (!first?.id) return;

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

    p.selectTrack(first.id);
    p.setPendingTrackId(undefined);

    primedRef.current = true;
  }, [album, tracks, hasSt, qAlbum, currentAlbumSlug, qTrack, p]);

  const autoplayFiredRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!isPlayer) return;
    if (!qAutoplay) return;
    if (!qTrack) return;

    if (!qShareToken) {
      patchQuery({ autoplay: null });
      return;
    }

    if (!album || tracks.length === 0) return;

    const key = `${qAlbum ?? ""}:${qTrack}:${qShareToken}`;
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

    const t = tracks.find((x) => x.id === qTrack);
    play(t);
    patchQuery({ autoplay: null });
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

  const gateNodeTopRight = (
    <ActivationGate
      attentionMessage={derivedAttentionMessage}
      canManageBilling={canManageBilling}
      isPatron={isPatron}
      tier={tier}
    >
      <div />
    </ActivationGate>
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
  const bannerCode = gift ?? checkout ?? null;
  const bannerNode =
    !bannerDismissed && bannerKind && bannerCode ? (
      <FullWidthBanner
        kind={bannerKind}
        code={bannerCode}
        onDismiss={dismissBanner}
      />
    ) : null;

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
          initialExegesisTrackId={props.initialExegesisTrackId ?? null}
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
              <div
                style={{
                  width: "100%",
                  borderRadius: 0,
                  border: "none",
                  background: "transparent",
                  padding: 12,
                  minWidth: 0,
                  position: "relative",
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

/* --- Logo “veil” effect: slow shadow wash (visible -> almost swallowed -> visible) --- */
@keyframes afLogoVeilDrift {
  0%, 100% {
    background-position: 0% 50%;
    opacity: 0.24;
    transform: translateX(-2%) translateY(-0.6%);
  }
  55% {
    background-position: 100% 50%;
    opacity: 0.78;
    transform: translateX(2%) translateY(0.6%);
  }
}

/* slower counter-moving layer */
@keyframes afLogoVeilDriftSlow {
  0%, 100% {
    background-position: 100% 50%;
    opacity: 0.18;
    transform: translateX(2%) translateY(0.35%);
  }
  55% {
    background-position: 0% 50%;
    opacity: 0.46;
    transform: translateX(-2%) translateY(-0.35%);
  }
}
}
.afLogoVeilWrap {
  position: relative;
  display: inline-block;
  line-height: 0;
  isolation: isolate; /* keeps blend/stacking predictable */
}

/* Force the image to be its own stacking participant */
.afLogoVeilImg {
  position: relative;
  z-index: 1;
  display: inline-block;
}

.afLogoVeil {
  position: absolute;
  inset: -34% -26%;
  pointer-events: none;
  z-index: 2;

  mix-blend-mode: multiply;

  /* primary shadow sweep */
  background-image: linear-gradient(
    90deg,
    rgba(0,0,0,0.00) 0%,
    rgba(0,0,0,0.82) 22%,
    rgba(0,0,0,0.98) 44%,
    rgba(0,0,0,0.70) 68%,
    rgba(0,0,0,0.00) 100%
  );
  background-repeat: no-repeat;
  background-size: 220% 100%;
  background-position: 0% 50%;

  opacity: 0.24;

  filter: blur(1.15px);
  animation: afLogoVeilDrift 14.5s ease-in-out infinite;
  will-change: transform, opacity, background-position;
}

/* secondary softer environmental shadow */
.afLogoVeil::before {
  content: "";
  position: absolute;
  inset: -10% -18%;
  pointer-events: none;

  background-image: linear-gradient(
    90deg,
    rgba(0,0,0,0.00) 0%,
    rgba(0,0,0,0.55) 30%,
    rgba(0,0,0,0.65) 52%,
    rgba(0,0,0,0.40) 72%,
    rgba(0,0,0,0.00) 100%
  );

  background-repeat: no-repeat;
  background-size: 240% 100%;
  background-position: 100% 50%;

  opacity: 0.28;
  filter: blur(2.2px);

  animation: afLogoVeilDriftSlow 21s ease-in-out infinite;
  will-change: transform, opacity, background-position;
}

/* faint grain to keep the sweep from feeling “too perfect” */
.afLogoVeil::after {
  content: "";
  position: absolute;
  inset: -16% -16%;
  pointer-events: none;

  /*
    Pure-CSS “noise” approximation: tiny repeating speckles.
    It’s intentionally subtle — it should read as texture, not dots.
  */
  background-image:
    repeating-radial-gradient(circle at 12% 18%, rgba(255,255,255,0.09) 0 0.7px, rgba(255,255,255,0.00) 0.7px 2.2px),
    repeating-radial-gradient(circle at 74% 63%, rgba(255,255,255,0.06) 0 0.8px, rgba(255,255,255,0.00) 0.8px 2.6px);
  background-size: 140px 110px, 170px 140px;
  background-position: 0% 0%, 30% 10%;

  mix-blend-mode: soft-light;
  opacity: 0.10;
  filter: blur(0.35px);

  /* very slow drift so it never “locks” to the logo */
  animation: afLogoVeilNoiseDrift 27s linear infinite;
  will-change: transform, opacity, background-position;
}

@keyframes afLogoVeilNoiseDrift {
  0%   { transform: translateX(0%) translateY(0%); background-position: 0% 0%, 30% 10%; opacity: 0.08; }
  50%  { transform: translateX(1.8%) translateY(-1.2%); background-position: 60% 40%, 10% 70%; opacity: 0.12; }
  100% { transform: translateX(0%) translateY(0%); background-position: 0% 0%, 30% 10%; opacity: 0.08; }
}

@media (prefers-reduced-motion: reduce) {
  /* Keep a mild shadow, just stop movement */
  .afLogoVeil { animation: none !important; opacity: 0.22; }
}
@media (max-width:720px) {
  .afTopBar { grid-template-columns:1fr; grid-template-rows:auto auto; gap:10px; align-items:stretch; justify-items:stretch; }
  .afTopBarLogo { grid-row:1; grid-column:1 / -1; width:100%; padding:10px 0 0; display:flex; align-items:flex-end; justify-content:center; }
  .afTopBarControls { grid-row:2; display:grid; grid-template-columns:auto 1fr; align-items:stretch; column-gap:10px; row-gap:0px; width:100%; min-width:0; }
  .afTopBarLeft { grid-column:1; justify-self:start; display:flex; align-items:flex-end; align-self:stretch; }
  .afTopBarRight { grid-column:2; justify-self:end; width:100%; display:flex; align-items:flex-end; justify-content:flex-end; align-self:stretch; }
  .afTopBarRightInner { margin-left:auto; max-width:520px; height:100%; display:flex; flex-direction:column; justify-content:flex-end; }
}
`}</style>

                <div
                  className="afTopBar"
                  style={{ position: "relative", zIndex: 5 }}
                >
                  <div className="afTopBarLogo">
                    <div className="afTopBarLogoInner">
                      {props.topLogoUrl ? (
                        <div className="afLogoVeilWrap">
                          <div className="afLogoVeilImg">
                            <Image
                              src={props.topLogoUrl}
                              alt="Logo"
                              height={Math.max(
                                16,
                                Math.min(120, props.topLogoHeight ?? 38),
                              )}
                              width={Math.max(
                                16,
                                Math.min(120, props.topLogoHeight ?? 38),
                              )}
                              sizes="(max-width: 720px) 120px, 160px"
                              style={{
                                height: Math.max(
                                  16,
                                  Math.min(120, props.topLogoHeight ?? 38),
                                ),
                                width: "auto",
                                objectFit: "contain",
                                opacity: 0.94,
                                userSelect: "none",
                                filter:
                                  "drop-shadow(0 10px 22px rgba(0,0,0,0.28))",
                              }}
                            />
                          </div>
                          <div aria-hidden="true" className="afLogoVeil" />
                        </div>
                      ) : (
                        <div
                          aria-label="AF"
                          title="AF"
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "rgba(0,0,0,0.22)",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 13,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            opacity: 0.92,
                            userSelect: "none",
                          }}
                        >
                          AF
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="afTopBarControls">
                    <div className="afTopBarLeft">
                      <style>{`
.afTopBarBtn { position: relative; transition: transform 160ms ease, opacity 160ms ease, filter 160ms ease, box-shadow 160ms ease; will-change: transform, filter; }
.afTopBarBtn::after { content:""; position:absolute; inset:0; border-radius:999px; pointer-events:none; background: radial-gradient(circle at 50% 45%, rgba(255,255,255,0.10), rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.00) 65%); opacity:0; transition:opacity 160ms ease; }
.afTopBarBtn:hover::after { opacity:1; }
.afTopBarBtn:hover { transform: translateY(-1px); opacity:0.98; filter:brightness(1.06); }
.afTopBarBtn:active { transform: translateY(0px) scale(0.97); filter:brightness(0.97); }
.afIcon { transform: translateY(0px); transition: transform 160ms ease; will-change: transform; }
.afIconPortal { transform: translateY(3px); }
.afTopBarBtn:hover .afIconPlayer { transform: translate(0.8px, -0.2px) scale(1.03); }
.afPortalTop { transition: transform 180ms ease; transform-origin: 12px 8px; }
.afTopBarBtn:hover .afPortalTop { transform: translateY(-0.4px); }
.afTopBarBtn:hover .afIconPortal { transform: translateY(2px) scale(1.015); }
.afTopBarBtn:focus-visible { outline:none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 26%, transparent), 0 14px 30px rgba(0,0,0,0.22); }
`}</style>

                      {(() => {
                        const commonBtn: React.CSSProperties = {
                          width: 46,
                          height: 46,
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.14)",
                          color: "rgba(255,255,255,0.90)",
                          cursor: "pointer",
                          display: "grid",
                          placeItems: "center",
                          userSelect: "none",
                          WebkitTapHighlightColor: "transparent",
                        };

                        return (
                          <>
                            <button
                              type="button"
                              aria-label="Player"
                              title="Player"
                              onMouseEnter={prefetchPlayer}
                              onFocus={prefetchPlayer}
                              onClick={() => {
                                setOptimisticSurface("player");
                                forceSurface("player");
                              }}
                              className="afTopBarBtn"
                              style={{
                                ...commonBtn,
                                background: effectiveIsPlayer
                                  ? "color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))"
                                  : "rgba(255,255,255,0.04)",
                                boxShadow: effectiveIsPlayer
                                  ? "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)"
                                  : "0 12px 26px rgba(0,0,0,0.18)",
                                opacity: effectiveIsPlayer ? 0.98 : 0.78,
                              }}
                            >
                              <IconPlayer />
                            </button>

                            <button
                              type="button"
                              aria-label="Portal"
                              title="Portal"
                              onMouseEnter={prefetchPortal}
                              onFocus={prefetchPortal}
                              onClick={() => {
                                const desired =
                                  (getLastPortalTab() ??
                                    portalTabId ??
                                    DEFAULT_PORTAL_TAB) ||
                                  DEFAULT_PORTAL_TAB;
                                setOptimisticSurface("portal");
                                forceSurface("portal", desired);
                              }}
                              className="afTopBarBtn"
                              style={{
                                ...commonBtn,
                                background: !effectiveIsPlayer
                                  ? "color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))"
                                  : "rgba(255,255,255,0.04)",
                                boxShadow: !effectiveIsPlayer
                                  ? "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)"
                                  : "0 12px 26px rgba(0,0,0,0.18)",
                                opacity: !effectiveIsPlayer ? 0.98 : 0.78,
                              }}
                            >
                              <IconPortal />
                            </button>
                          </>
                        );
                      })()}
                    </div>

                    <div className="afTopBarRight">
                      <div
                        className="afTopBarRightInner"
                        style={{ maxWidth: 520, minWidth: 0 }}
                      >
                        <div
                          style={{
                            position: "relative",
                            visibility: spotlightAttention
                              ? "hidden"
                              : "visible",
                            pointerEvents: spotlightAttention ? "none" : "auto",
                          }}
                        >
                          {gateNodeTopRight}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {bannerNode}
              </div>
            )}
          />
        </PortalViewerProvider>
        <MiniPlayerHost onExpand={() => forceSurface("player")} />
      </div>
    </>
  );
}
