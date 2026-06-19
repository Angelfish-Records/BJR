// web/app/home/useSessionSurfaceController.ts
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  useClientSearchParams,
  replaceQuery,
} from "./urlState";
import { getLastPortalTab } from "./portalLastTab";

const DEFAULT_PORTAL_TAB = "journal";

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

type PublicAlbumRoute = {
  albumSlug: string | null;
  displayId: string | null;
};

type BannerKind = "gift" | "checkout" | null;

function splitPath(pathname: string | null): string[] {
  return (pathname ?? "").split("?")[0].split("/").filter(Boolean);
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
  if (head === "player") return null;
  if (!RESERVED_ROOTS.has(head)) return null;
  return head;
}

function parsePublicAlbumPath(pathname: string | null): PublicAlbumRoute {
  const parts = splitPath(pathname);

  if (parts.length === 0 || parts.length > 2) {
    return { albumSlug: null, displayId: null };
  }

  const slugRaw = (parts[0] ?? "").trim();
  if (!slugRaw) return { albumSlug: null, displayId: null };

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

function buildSurfaceHref(
  secondary: URLSearchParams,
  opts: {
    toPlayer?: boolean;
    tab?: string | null;
    clearPosts?: boolean;
    albumSlugForPlayer: string;
  },
): string {
  const next = new URLSearchParams(secondary.toString());

  for (const key of ["p", "panel", "album", "track", "t"]) {
    next.delete(key);
  }

  if (opts.clearPosts) {
    next.delete("post");
    next.delete("pt");
  }

  const base = opts.toPlayer
    ? `/${encodeURIComponent(opts.albumSlugForPlayer)}`
    : `/${encodeURIComponent(opts.tab ?? DEFAULT_PORTAL_TAB)}`;

  const query = next.toString();
  return query ? `${base}?${query}` : base;
}

export function useSessionSurfaceController(props: {
  defaultAlbumSlug: string;
}) {
  const { defaultAlbumSlug } = props;

  const router = useRouter();
  const pathname = usePathname();
  const sp = useClientSearchParams();

  const route = React.useMemo(() => parsePublicAlbumPath(pathname), [pathname]);
  const isMusicRoute = Boolean(route.albumSlug);
  const pathTab = React.useMemo(() => portalTabFromPathname(pathname), [pathname]);

  const isPlayer = isMusicRoute;
  const portalTabId = !isPlayer ? pathTab : null;

  const [optimisticSurface, setOptimisticSurface] = React.useState<
    "player" | "portal" | null
  >(null);

  React.useEffect(() => {
    if (!optimisticSurface) return;
    const reality = isPlayer ? "player" : "portal";
    if (reality === optimisticSurface) setOptimisticSurface(null);
  }, [optimisticSurface, isPlayer]);

  const effectiveIsPlayer =
    optimisticSurface != null ? optimisticSurface === "player" : isPlayer;

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    root.dataset.afSurface = effectiveIsPlayer ? "player" : "portal";

    return () => {
      delete root.dataset.afSurface;
    };
  }, [effectiveIsPlayer]);

  const playerAlbumSlug = route.albumSlug ?? defaultAlbumSlug;

  const hrefToPlayer = React.useMemo(() => {
    const secondary = new URLSearchParams(sp.toString());
    return buildSurfaceHref(secondary, {
      toPlayer: true,
      clearPosts: false,
      albumSlugForPlayer: playerAlbumSlug,
    });
  }, [sp, playerAlbumSlug]);

  const hrefToPortal = React.useMemo(() => {
    const secondary = new URLSearchParams(sp.toString());
    const desired =
      (getLastPortalTab() ?? portalTabId ?? DEFAULT_PORTAL_TAB) ||
      DEFAULT_PORTAL_TAB;

    return buildSurfaceHref(secondary, {
      toPlayer: false,
      tab: desired,
      clearPosts: false,
      albumSlugForPlayer: playerAlbumSlug,
    });
  }, [sp, portalTabId, playerAlbumSlug]);

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
      const filtered: Record<string, string | null | undefined> = {};

      for (const [key, value] of Object.entries(patch)) {
        if (
          key === "st" ||
          key === "share" ||
          key === "autoplay" ||
          key === "gift" ||
          key === "checkout" ||
          key === "post" ||
          key === "pt" ||
          key.startsWith("utm_")
        ) {
          filtered[key] = value;
        }
      }

      if (Object.keys(filtered).length > 0) {
        replaceQuery(filtered);
      }
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
        albumSlugForPlayer: playerAlbumSlug,
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

    if (dismissedKeyRef.current !== bannerKey) {
      setBannerDismissed(false);
    }
  }, [bannerKey]);

  const dismissBanner = React.useCallback(() => {
    if (!bannerKey) return;

    dismissedKeyRef.current = bannerKey;
    setBannerDismissed(true);

    if (gift) replaceQuery({ gift: null });
    if (checkout) replaceQuery({ checkout: null });
  }, [bannerKey, gift, checkout]);

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

  const bannerKind: BannerKind = gift ? "gift" : checkout ? "checkout" : null;
  const bannerCode =
    !bannerDismissed && (gift ?? checkout ?? null)
      ? (gift ?? checkout ?? null)
      : null;

  const openPlayer = React.useCallback(() => {
    setOptimisticSurface("player");
    forceSurface("player");
  }, [forceSurface]);

  const openPortal = React.useCallback(
    (tabId?: string | null) => {
      setOptimisticSurface("portal");
      forceSurface("portal", tabId);
    },
    [forceSurface],
  );

  return {
    sp,
    route,
    isPlayer,
    portalTabId,
    effectiveIsPlayer,
    playerAlbumSlug,
    patchQuery,
    forceSurface,
    prefetchPlayer,
    prefetchPortal,
    dismissBanner,
    bannerKind,
    bannerCode,
    openPlayer,
    openPortal,
  };
}