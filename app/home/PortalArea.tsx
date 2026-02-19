// web/app/home/PortalArea.tsx
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/nextjs";
import PortalShell, { PortalPanelSpec } from "./PortalShell";
import {
  useClientSearchParams,
  replaceQuery,
  getAutoplayFlag,
} from "./urlState";
import { usePlayer } from "@/app/home/player/PlayerState";
import { useGlobalTransportKeys } from "./player/useGlobalTransportKeys";
import type { PlayerTrack, AlbumInfo, AlbumNavItem, Tier } from "@/lib/types";
import PlayerController from "./player/PlayerController";
import MiniPlayer from "./player/MiniPlayer";
import ActivationGate from "@/app/home/ActivationGate";
import { PortalViewerProvider } from "@/app/home/PortalViewerProvider";
import { MembershipModalProvider } from "@/app/home/MembershipModalProvider";
import Image from "next/image";

const DEFAULT_PORTAL_TAB = "extras";

function normalizeP(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return v || "player";
}

function getLastPortalTab(): string | null {
  try {
    return (sessionStorage.getItem("af:lastPortalTab") ?? "").trim() || null;
  } catch {
    return null;
  }
}

function setLastPortalTab(id: string) {
  try {
    sessionStorage.setItem("af:lastPortalTab", id);
  } catch {}
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

type AlbumPayload = { album: AlbumInfo | null; tracks: PlayerTrack[] };

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

/** Top-right (native) bar: ONLY for auth/blocking attention (non-spotlight). */
function MiniMessageBar(props: { attentionMessage: string | null }) {
  const { attentionMessage } = props;
  if (!attentionMessage) return null;

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(0,0,0,0.28)",
        padding: "10px 12px",
        fontSize: 12,
        opacity: 0.92,
        lineHeight: 1.45,
        textAlign: "left",
        maxWidth: "100%",
        width: "100%",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          marginTop: 1,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.14)",
          flex: "0 0 auto",
        }}
      >
        <span aria-hidden>⚠️</span>
      </div>

      <div style={{ minWidth: 0 }}>{attentionMessage}</div>
    </div>
  );
}

/** Centered modal message (spotlight state). */
function ModalAttentionMessage(props: { attentionMessage: string | null }) {
  const { attentionMessage } = props;
  if (!attentionMessage) return null;

  return (
    <div
      style={{
        width: "100%",
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.14)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.24))",
        padding: "16px 16px",
        boxShadow: "0 18px 52px rgba(0,0,0,0.35)",
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 13,
          lineHeight: "17px",
          opacity: 0.9,
          paddingLeft: 2,
        }}
      >
        {attentionMessage}
      </div>
    </div>
  );
}

type BannerTone = "success" | "neutral" | "warn";

function bannerStyle(tone: BannerTone) {
  const border =
    tone === "success"
      ? "color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.14))"
      : tone === "warn"
        ? "rgba(255,255,255,0.18)"
        : "rgba(255,255,255,0.14)";

  const bg =
    tone === "success"
      ? "color-mix(in srgb, var(--accent) 10%, rgba(0,0,0,0.22))"
      : tone === "warn"
        ? "rgba(0,0,0,0.28)"
        : "rgba(0,0,0,0.22)";

  return { border, bg };
}

/** Full-width banner under topbar: non-auth flow messages. */
function FullWidthBanner(props: {
  kind: "gift" | "checkout" | null;
  code: string | null;
  onDismiss: () => void;
}) {
  const { kind, code, onDismiss } = props;
  if (!kind || !code) return null;

  let tone: BannerTone = "neutral";
  let icon: React.ReactNode = null;
  let text: React.ReactNode = null;

  if (kind === "checkout") {
    if (code === "success") {
      tone = "success";
      icon = <span aria-hidden>✅</span>;
      text = (
        <>
          Checkout completed. If your access hasn&apos;t appeared yet, refresh
          once (webhooks can be a beat behind).
        </>
      );
    } else if (code === "cancel") {
      tone = "neutral";
      icon = <span aria-hidden>⤺</span>;
      text = <>Checkout cancelled.</>;
    } else return null;
  }

  if (kind === "gift") {
    if (code === "ready") {
      tone = "success";
      icon = <span aria-hidden>🎁</span>;
      text = <>Gift activated. Your content is now available.</>;
    } else if (code === "not_paid") {
      tone = "neutral";
      icon = <span aria-hidden>⏳</span>;
      text = (
        <>
          This gift hasn&apos;t completed payment yet. If you just paid, refresh
          in a moment.
        </>
      );
    } else if (code === "wrong_account") {
      tone = "warn";
      icon = <span aria-hidden>⚠️</span>;
      text = (
        <>
          This gift was sent to a different email. Sign in with the recipient
          account.
        </>
      );
    } else if (code === "claim_code_missing") {
      tone = "warn";
      icon = <span aria-hidden>⚠️</span>;
      text = (
        <>
          That link is missing its claim code. Open the exact link from the
          email.
        </>
      );
    } else if (code === "invalid_claim") {
      tone = "warn";
      icon = <span aria-hidden>⚠️</span>;
      text = (
        <>
          That claim code doesn&apos;t match this gift. Open the exact link from
          the email.
        </>
      );
    } else if (code === "missing") {
      tone = "warn";
      icon = <span aria-hidden>⚠️</span>;
      text = <>That gift link looks invalid.</>;
    } else return null;
  }

  const { border, bg } = bannerStyle(tone);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginTop: 10,
        borderRadius: 16,
        border: `1px solid ${border}`,
        background: bg,
        padding: "12px 14px",
        fontSize: 13,
        opacity: 0.96,
        lineHeight: 1.45,
        textAlign: "left",
        width: "100%",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        boxShadow: "0 18px 44px rgba(0,0,0,0.22)",
        position: "relative",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          marginTop: 1,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.14)",
          flex: "0 0 auto",
        }}
      >
        {icon}
      </div>

      <div style={{ minWidth: 0, paddingRight: 26 }}>{text}</div>

      <button
        type="button"
        aria-label="Dismiss message"
        onClick={onDismiss}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.88)",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          lineHeight: 1,
          fontSize: 16,
          userSelect: "none",
        }}
      >
        ×
      </button>
    </div>
  );
}

function BodyPortal(props: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  if (typeof document === "undefined") return null;
  return createPortal(props.children, document.body);
}

function SpotlightVeil(props: { active: boolean }) {
  const { active } = props;
  const debugbarStyleRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!active) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [active]);

  React.useEffect(() => {
    const el =
      typeof document !== "undefined"
        ? document.getElementById("af-admin-debugbar")
        : null;
    if (!el) return;

    if (debugbarStyleRef.current == null) {
      debugbarStyleRef.current = el.getAttribute("style") ?? "";
    }

    if (active) {
      el.setAttribute(
        "style",
        `${debugbarStyleRef.current}; position: relative; z-index: 50000; pointer-events: auto;`,
      );
    } else {
      const orig = debugbarStyleRef.current ?? "";
      if (orig.trim()) el.setAttribute("style", orig);
      else el.removeAttribute("style");
    }
  }, [active]);

  if (!active) return null;
  return (
    <BodyPortal>
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 20000,
          pointerEvents: "auto",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          background: "rgba(0,0,0,0.30)",
        }}
      />
    </BodyPortal>
  );
}

function useFocusTrap(
  enabled: boolean,
  rootRef: React.RefObject<HTMLElement | null>,
) {
  React.useEffect(() => {
    if (!enabled) return;

    const root = rootRef.current;
    if (!root) return;

    const isElementDisabled = (el: Element): boolean => {
      if (el instanceof HTMLButtonElement) return el.disabled;
      if (el instanceof HTMLInputElement) return el.disabled;
      if (el instanceof HTMLSelectElement) return el.disabled;
      if (el instanceof HTMLTextAreaElement) return el.disabled;
      if (el instanceof HTMLOptGroupElement) return el.disabled;
      if (el instanceof HTMLOptionElement) return el.disabled;
      return false;
    };

    const isActuallyFocusable = (el: HTMLElement): boolean => {
      if (el.tabIndex < 0) return false;
      if (isElementDisabled(el)) return false;

      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden")
        return false;

      return true;
    };

    const isFocusable = (el: Element): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;

      const tag = el.tagName.toLowerCase();
      const focusableTags = new Set([
        "input",
        "button",
        "select",
        "textarea",
        "a",
      ]);

      if (tag === "a") {
        const a = el as HTMLAnchorElement;
        if (!a.href && el.tabIndex <= 0) return false;
      } else if (!focusableTags.has(tag)) {
        if (el.getAttribute("role") !== "button") return false;
      }

      return isActuallyFocusable(el);
    };

    const getFocusable = (): HTMLElement[] => {
      const all = Array.from(root.querySelectorAll("*"));
      return all.filter(isFocusable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!enabled) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.key !== "Tab") return;

      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const idx = active ? items.indexOf(active) : -1;

      const nextIdx = e.shiftKey
        ? idx <= 0
          ? items.length - 1
          : idx - 1
        : idx >= items.length - 1
          ? 0
          : idx + 1;

      e.preventDefault();
      items[nextIdx]?.focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, rootRef]);
}

function SpotlightModal(props: {
  active: boolean;
  attentionMessage: string | null;
  gateNode: React.ReactNode;
}) {
  const { active, attentionMessage, gateNode } = props;
  const modalRef = React.useRef<HTMLDivElement | null>(null);

  useFocusTrap(active, modalRef);

  if (!active) return null;

  return (
    <BodyPortal>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 30000,
          pointerEvents: "auto",
          display: "grid",
          placeItems: "center",
          padding: "min(7vh, 56px) 16px",
        }}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Authentication required"
          style={{
            width: "100%",
            // slimmer + taller feel
            maxWidth: "min(92vw, 520px)",
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(10,10,14,0.92)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: `
              0 28px 80px rgba(0,0,0,0.60),
              0 0 0 1px rgba(255,255,255,0.04),
              0 60px 160px rgba(0,0,0,0.80)
            `,
            padding: 20,
            display: "grid",
            gap: 14,
          }}
        >
          <ModalAttentionMessage attentionMessage={attentionMessage} />

          <div
            style={{
              width: "100%",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.22)",
              padding: 16,
              boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
              display: "grid",
              placeItems: "center",
            }}
          >
            {gateNode}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

function parsePublicAlbumPath(pathname: string | null): {
  albumSlug: string | null;
  trackId: string | null;
} {
  const p = (pathname ?? "").trim();
  // Expected:
  // /album/:slug
  // /album/:slug/track/:trackId
  const m = p.match(/^\/album\/([^\/?#]+)(?:\/track\/([^\/?#]+))?\/?$/i);
  if (!m) return { albumSlug: null, trackId: null };
  const albumSlug = decodeURIComponent(m[1] ?? "").trim() || null;
  const trackId = decodeURIComponent(m[2] ?? "").trim() || null;
  return { albumSlug, trackId };
}

export default function PortalArea(props: {
  portalPanel: React.ReactNode;
  topLogoUrl?: string | null;
  topLogoHeight?: number | null;
  albumSlug: string;
  album: AlbumInfo | null;
  tracks: PlayerTrack[];
  albums: AlbumNavItem[];
  attentionMessage?: string | null;
  tier?: string | null;
  isPatron?: boolean;
  isAdmin?: boolean;
  canManageBilling?: boolean;
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

  // On /album/... routes, primary navigation is path-first: force player surface.
  const rawP = isPublicAlbumRoute
    ? "player"
    : normalizeP(sp.get("p") ?? "player");
  const isPlayer = rawP === "player";
  const portalTabId = isPlayer ? null : rawP;

  React.useEffect(() => {
    if (!isPlayer && portalTabId) setLastPortalTab(portalTabId);
  }, [isPlayer, portalTabId]);

  const patchQuery = React.useCallback(
    (patch: Record<string, string | null | undefined>) => {
      if (!isPublicAlbumRoute) {
        replaceQuery(patch);
        return;
      }

      // On /album/... routes: query params are secondary only.
      // Allow: st/share, autoplay, utm_*
      const filtered: Record<string, string | null | undefined> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (
          k === "st" ||
          k === "share" ||
          k === "autoplay" ||
          k.startsWith("utm_")
        ) {
          filtered[k] = v;
        }
      }
      if (Object.keys(filtered).length) replaceQuery(filtered);
    },
    [isPublicAlbumRoute],
  );

  const forceSurface = React.useCallback(
    (surface: "player" | "portal", tabId?: string | null) => {
      if (surface === "player") {
        if (rawP === "player") return;
        patchQuery({ p: "player", post: null, autoplay: null });
        return;
      }

      const desired =
        (
          tabId ??
          getLastPortalTab() ??
          portalTabId ??
          DEFAULT_PORTAL_TAB
        ).trim() || DEFAULT_PORTAL_TAB;
      if (rawP === desired) return;

      patchQuery({
        p: desired,
        album: null,
        track: null,
        t: null,
        autoplay: null,
      });
    },
    [patchQuery, rawP, portalTabId],
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

  const lastPRawRef = React.useRef<string>(rawP);
  React.useEffect(() => {
    const prev = lastPRawRef.current;
    if (prev !== rawP) {
      lastPRawRef.current = rawP;
      if (!bannerDismissed && bannerKey) dismissBanner();
    }
  }, [rawP, bannerDismissed, bannerKey, dismissBanner]);

  const derivedAttentionMessage =
    attentionMessage ??
    (p.shouldShowTopbarBlockMessage ? (p.lastError ?? null) : null);

  const spotlightEligibleCode =
    p.blockedCode === "AUTH_REQUIRED" ||
    p.blockedCode === "ANON_CAP_REACHED" ||
    p.blockedCode === "CAP_REACHED";

  const dbgForceSpotlight =
    process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1" &&
    typeof window !== "undefined" &&
    window.sessionStorage.getItem("af:dbgSpotlight") === "1";

  const spotlightAttention =
    !!derivedAttentionMessage &&
    p.blockUiMode === "global" &&
    spotlightEligibleCode &&
    (!isSignedIn || dbgForceSpotlight);

  const qAlbum =
    (isPublicAlbumRoute
      ? route.albumSlug
      : (sp.get("album") ?? "").trim() || null) ?? null;
  const qTrack =
    (isPublicAlbumRoute
      ? route.trackId
      : (sp.get("track") ?? "").trim() || null) ?? null;

  // Secondary concerns stay query-based (allowed everywhere)
  const qAutoplay = getAutoplayFlag(sp);
  const qShareToken = (sp.get("st") ?? sp.get("share") ?? "").trim() || null;
  const hasSt = Boolean(qShareToken);

  const forcedPlayerRef = React.useRef(false);
  React.useEffect(() => {
    if (forcedPlayerRef.current) return;

    const playbackIntent = Boolean(qTrack) || Boolean(qAutoplay); // add other “intent” flags here if needed

    if (!playbackIntent) return;

    // If we’re already on player, nothing to do.
    if (rawP === "player") {
      forcedPlayerRef.current = true;
      return;
    }

    // Canonicalise: playback intent implies player surface.
    forcedPlayerRef.current = true;
    patchQuery({ p: "player" });
  }, [qTrack, qAutoplay, rawP, patchQuery]);

  const [currentAlbumSlug, setCurrentAlbumSlug] =
    React.useState<string>(albumSlug);
  const [album, setAlbum] = React.useState<AlbumInfo | null>(initialAlbum);
  const [tracks, setTracks] = React.useState<PlayerTrack[]>(initialTracks);
  const [isBrowsingAlbum, setIsBrowsingAlbum] = React.useState(false);

  React.useEffect(() => {
    setAlbum(initialAlbum);
    setTracks(initialTracks);
    setCurrentAlbumSlug(albumSlug);
  }, [albumSlug, initialAlbum, initialTracks]);

  const fetchSeq = React.useRef(0);
  const isBrowsingRef = React.useRef(false);

  React.useEffect(() => {
    isBrowsingRef.current = isBrowsingAlbum;
  }, [isBrowsingAlbum]);

  const onSelectAlbum = React.useCallback(
    async (slug: string) => {
      if (!slug) return;
      if (isBrowsingRef.current) return;

      // If we're on canonical public album routes, navigate by path (not query).
      if (isPublicAlbumRoute) {
        const saved = getSavedSt(slug);

        // Preserve st if available (secondary param), drop everything else.
        const qs = new URLSearchParams();
        if (saved) qs.set("st", saved);

        // Note: we intentionally do NOT carry p/album/track in query.
        const href = `/album/${encodeURIComponent(slug)}${qs.toString() ? `?${qs}` : ""}`;
        router.push(href);
        return;
      }

      const saved = getSavedSt(slug);

      patchQuery({
        p: "player",
        album: slug,
        track: null,
        t: null,
        autoplay: null,
        st: saved || null,
        share: null,
      });

      setIsBrowsingAlbum(true);
      setCurrentAlbumSlug(slug);
      setAlbum(null);
      setTracks([]);

      const seq = ++fetchSeq.current;

      try {
        const res = await fetch(`/api/albums/${encodeURIComponent(slug)}`, {
          method: "GET",
        });
        if (!res.ok) throw new Error(`Album fetch failed (${res.status})`);
        const json = (await res.json()) as AlbumPayload;
        if (seq !== fetchSeq.current) return;

        setAlbum(json.album ?? null);
        setTracks(Array.isArray(json.tracks) ? json.tracks : []);
      } catch (e) {
        if (seq !== fetchSeq.current) return;
        console.error(e);
      } finally {
        if (seq !== fetchSeq.current) return;
        setIsBrowsingAlbum(false);
      }
    },
    [patchQuery, isPublicAlbumRoute, router],
  );

  React.useEffect(() => {
    if (!isPlayer) return;
    if (!qAlbum) return;
    if (qAlbum !== currentAlbumSlug) void onSelectAlbum(qAlbum);
  }, [isPlayer, qAlbum, currentAlbumSlug, onSelectAlbum]);

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
      ? (album.catalogId ?? undefined)
      : (album.catalogId ?? album.id ?? undefined);

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
      ? (album.catalogId ?? undefined)
      : (album.catalogId ?? album.id ?? undefined);
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
      forceSurface("player");
      if (slug) void onSelectAlbum(slug);
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
            albumSlug={currentAlbumSlug}
            album={album}
            tracks={tracks}
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
      portalPanel,
      currentAlbumSlug,
      album,
      tracks,
      albums,
      forceSurface,
      isBrowsingAlbum,
      onSelectAlbum,
      viewerTier,
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

  const miniMsgNode = (
    <MiniMessageBar attentionMessage={derivedAttentionMessage} />
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
      <SpotlightVeil active={spotlightAttention} />
      <SpotlightModal
        active={spotlightAttention}
        attentionMessage={derivedAttentionMessage}
        gateNode={gateNodeModal}
      />

      <div
        style={{ height: "100%", minHeight: 0, minWidth: 0, display: "grid" }}
      >
        <MembershipModalProvider>
          <PortalViewerProvider
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
              activePanelId={isPlayer ? "player" : "portal"}
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
                                onClick={() => forceSurface("player")}
                                className="afTopBarBtn"
                                style={{
                                  ...commonBtn,
                                  background: isPlayer
                                    ? "color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))"
                                    : "rgba(255,255,255,0.04)",
                                  boxShadow: isPlayer
                                    ? "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)"
                                    : "0 12px 26px rgba(0,0,0,0.18)",
                                  opacity: isPlayer ? 0.98 : 0.78,
                                }}
                              >
                                <IconPlayer />
                              </button>

                              <button
                                type="button"
                                aria-label="Portal"
                                title="Portal"
                                onClick={() => forceSurface("portal")}
                                className="afTopBarBtn"
                                style={{
                                  ...commonBtn,
                                  background: !isPlayer
                                    ? "color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))"
                                    : "rgba(255,255,255,0.04)",
                                  boxShadow: !isPlayer
                                    ? "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)"
                                    : "0 12px 26px rgba(0,0,0,0.18)",
                                  opacity: !isPlayer ? 0.98 : 0.78,
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
                              pointerEvents: spotlightAttention
                                ? "none"
                                : "auto",
                            }}
                          >
                            {gateNodeTopRight}
                            {miniMsgNode}
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
        </MembershipModalProvider>
        <MiniPlayerHost onExpand={() => forceSurface("player")} />
      </div>
    </>
  );
}
