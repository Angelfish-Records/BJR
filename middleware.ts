// web/middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const PRESERVE_PREFIXES = ["utm_"];

/**
 * Secondary params we intentionally allow to live on /home/*.
 * Everything else is either legacy surface state or not meant to persist.
 */
const HOME_ALLOWED_KEYS = new Set([
  "st",
  "share",
  "autoplay",
  "gift",
  "checkout",
  "post",
  "pt",
]);

const LEGACY_HOME_KEYS = new Set(["p", "panel", "album", "track", "t"]);

function splitPath(pathname: string): string[] {
  return (pathname ?? "").split("/").filter(Boolean);
}

function pickBasePreservedParams(url: URL): URLSearchParams {
  const out = new URLSearchParams();

  const st = (url.searchParams.get("st") ?? url.searchParams.get("share") ?? "")
    .trim();
  if (st) out.set("st", st);

  const autoplay = (url.searchParams.get("autoplay") ?? "").trim();
  if (autoplay) out.set("autoplay", autoplay);

  for (const [k, v] of url.searchParams.entries()) {
    if (PRESERVE_PREFIXES.some((p) => k.startsWith(p)) && v) out.set(k, v);
  }

  return out;
}

function pickHomeAllowedParams(url: URL): URLSearchParams {
  const out = pickBasePreservedParams(url);

  // explicitly allow these on /home/*
  for (const k of HOME_ALLOWED_KEYS) {
    if (k === "st" || k === "share" || k === "autoplay") continue; // already handled
    const v = (url.searchParams.get(k) ?? "").trim();
    if (v) out.set(k, v);
  }

  // Also preserve utm_* (already handled) and nothing else.
  return out;
}

function withQuery(dest: URL, qp: URLSearchParams): URL {
  dest.search = "";
  for (const [k, v] of qp.entries()) dest.searchParams.set(k, v);
  return dest;
}

function redirect308(reqUrl: URL, pathname: string, qp: URLSearchParams) {
  const dest = new URL(pathname, reqUrl.origin);
  withQuery(dest, qp);
  return NextResponse.redirect(dest, 308);
}

function homePathForLegacyTab(tab: string): string {
  const t = (tab ?? "").trim().toLowerCase();
  if (!t || t === "home" || t === "player") return "/home/player";
  return `/home/${encodeURIComponent(t)}`;
}

export default clerkMiddleware((_, req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // ---- 0) /home -> /home/player (enter canonical universe immediately) ----
  if (pathname === "/home") {
    const preserved = pickHomeAllowedParams(url);
    return redirect308(url, "/home/player", preserved);
  }

  // ---- 0.5) Canonicalise /home/* by stripping legacy surface params ----
  // If any legacy keys exist, redirect to same path with only allowed keys.
  if (pathname === "/home" || pathname.startsWith("/home/")) {
    let hasLegacy = false;
    for (const k of LEGACY_HOME_KEYS) {
      if ((url.searchParams.get(k) ?? "").trim()) {
        hasLegacy = true;
        break;
      }
    }

    // Also treat ?share as legacy alias but we preserve it as st.
    // (Handled in pickHomeAllowedParams)
    if (hasLegacy) {
      const preserved = pickHomeAllowedParams(url);
      return redirect308(url, pathname, preserved);
    }
  }

  // ---- 1) /albums (legacy) -> /album (canonical) ----
  if (pathname.startsWith("/albums/")) {
    const parts = splitPath(pathname);
    const slug = parts[1] ?? "";
    if (slug) {
      const preserved = pickBasePreservedParams(url);

      // /albums/:slug/track/:trackId
      if ((parts[2] ?? "") === "track" && parts[3]) {
        const targetPath = `/album/${encodeURIComponent(slug)}/track/${encodeURIComponent(
          parts[3],
        )}`;
        return redirect308(url, targetPath, preserved);
      }

      // legacy query /albums/:slug?track=:id
      const trackQ = (url.searchParams.get("track") ?? "").trim();
      const targetPath = trackQ
        ? `/album/${encodeURIComponent(slug)}/track/${encodeURIComponent(trackQ)}`
        : `/album/${encodeURIComponent(slug)}`;

      return redirect308(url, targetPath, preserved);
    }
  }

  // ---- 2) Legacy query-world /home?p=... -> canonical paths ----
  if (pathname === "/home" || pathname.startsWith("/home/")) {
    const p = (url.searchParams.get("p") ?? "").trim().toLowerCase();
    const album = (url.searchParams.get("album") ?? "").trim();
    const track = (url.searchParams.get("track") ?? "").trim();
    const post = (url.searchParams.get("post") ?? "").trim();
    const pt = (url.searchParams.get("pt") ?? "").trim();

    const preserved = pickHomeAllowedParams(url);

    // /home?p=player&album=:slug&track=:id  ->  /album/:slug/track/:id
    if (p === "player" && album) {
      const targetPath = track
        ? `/album/${encodeURIComponent(album)}/track/${encodeURIComponent(track)}`
        : `/album/${encodeURIComponent(album)}`;
      return redirect308(url, targetPath, pickBasePreservedParams(url));
    }

    // /home?p=<tab> -> /home/<tab>
    if (p && p !== "player") {
      if (p === "posts") {
        if (post) preserved.set("post", post);
        if (pt) preserved.set("pt", pt);
      }
      return redirect308(url, homePathForLegacyTab(p), preserved);
    }

    // legacy pt-only (no p) -> /home/<pt>
    if (!p && pt) {
      if (pt === "posts" && post) preserved.set("post", post);
      preserved.set("pt", pt);
      return redirect308(url, homePathForLegacyTab(pt), preserved);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};