// web/middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const PRESERVE_PREFIXES = ["utm_"];

// Query keys that are allowed to survive canonicalization.
const PRESERVE_KEYS = new Set<string>([
  "st",
  "share",
  "autoplay",
  // portal deep-linking / secondary concerns (keep if you use them)
  "post",
  "pt",
  "gift",
  "checkout",
]);

// Legacy UI-surface keys that must NEVER survive.
const STRIP_KEYS = new Set<string>(["p", "panel", "album", "track", "t"]);

function splitPath(pathname: string): string[] {
  return (pathname ?? "").split("/").filter(Boolean);
}

function pickPreservedParams(url: URL): URLSearchParams {
  const out = new URLSearchParams();

  // unify share token into st
  const st = (url.searchParams.get("st") ?? url.searchParams.get("share") ?? "")
    .trim();
  if (st) out.set("st", st);

  // keep autoplay if present
  const autoplay = (url.searchParams.get("autoplay") ?? "").trim();
  if (autoplay) out.set("autoplay", autoplay);

  // preserve secondary keys you actively use
  for (const k of ["post", "pt", "gift", "checkout"] as const) {
    const v = (url.searchParams.get(k) ?? "").trim();
    if (v) out.set(k, v);
  }

  // preserve utm_*
  for (const [k, v] of url.searchParams.entries()) {
    if (PRESERVE_PREFIXES.some((p) => k.startsWith(p)) && v) out.set(k, v);
  }

  return out;
}

function filteredCanonicalParams(url: URL): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of url.searchParams.entries()) {
    if (STRIP_KEYS.has(k)) continue;
    if (PRESERVE_KEYS.has(k) || PRESERVE_PREFIXES.some((p) => k.startsWith(p))) {
      const vv = (v ?? "").trim();
      if (vv) out.set(k, vv);
    }
  }

  // normalize share → st (never keep both)
  const st = (out.get("st") ?? out.get("share") ?? "").trim();
  out.delete("share");
  if (st) out.set("st", st);

  return out;
}

function sameParams(a: URLSearchParams, b: URLSearchParams): boolean {
  if (a.toString() === b.toString()) return true;
  // (toString order can vary; do a stable compare)
  if (a.size !== b.size) return false;
  for (const [k, v] of a.entries()) {
    if (b.get(k) !== v) return false;
  }
  return true;
}

function redirect308(reqUrl: URL, pathname: string, qp: URLSearchParams) {
  const dest = new URL(pathname, reqUrl.origin);
  // assign params
  for (const [k, v] of qp.entries()) dest.searchParams.set(k, v);
  return NextResponse.redirect(dest, 308);
}

export default clerkMiddleware((_, req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // ---- A) Hard upgrades: legacy /home family -> canonical tabs/player ----
  if (pathname === "/home") {
    return redirect308(url, "/extras", pickPreservedParams(url));
  }

  if (pathname === "/home/player") {
    return redirect308(url, "/player", pickPreservedParams(url));
  }

  if (pathname.startsWith("/home/")) {
    const parts = splitPath(pathname); // ["home", "<tab>", ...]
    const tab = (parts[1] ?? "").trim();
    return redirect308(url, tab ? `/${encodeURIComponent(tab)}` : "/extras", pickPreservedParams(url));
  }

  // ---- B) Hard upgrades: legacy /albums family -> canonical /album ----
  if (pathname.startsWith("/albums/")) {
    const parts = splitPath(pathname); // ["albums", ":slug", ...]
    const slug = (parts[1] ?? "").trim();
    if (slug) {
      const preserved = pickPreservedParams(url);

      // /albums/:slug/track/:trackId
      if ((parts[2] ?? "") === "track" && parts[3]) {
        return redirect308(
          url,
          `/album/${encodeURIComponent(slug)}/track/${encodeURIComponent(parts[3])}`,
          preserved,
        );
      }

      // /albums/:slug?track=...
      const trackQ = (url.searchParams.get("track") ?? "").trim();
      if (trackQ) {
        return redirect308(
          url,
          `/album/${encodeURIComponent(slug)}/track/${encodeURIComponent(trackQ)}`,
          preserved,
        );
      }

      // /albums/:slug
      return redirect308(url, `/album/${encodeURIComponent(slug)}`, preserved);
    }
  }

  // ---- C) Legacy query-world: /home?p=... -> new paths ----
  // NOTE: This still matters for external links.
  if (pathname === "/home" || pathname.startsWith("/home/")) {
    const p = (url.searchParams.get("p") ?? "").trim().toLowerCase();
    const album = (url.searchParams.get("album") ?? "").trim();
    const track = (url.searchParams.get("track") ?? "").trim();
    const post = (url.searchParams.get("post") ?? "").trim();
    const pt = (url.searchParams.get("pt") ?? "").trim();

    const preserved = pickPreservedParams(url);

    // /home?p=player&album=:slug&track=:id -> /album/:slug/track/:id
    if (p === "player" && album) {
      const target = track
        ? `/album/${encodeURIComponent(album)}/track/${encodeURIComponent(track)}`
        : `/album/${encodeURIComponent(album)}`;
      return redirect308(url, target, preserved);
    }

    // /home?p=<tab> -> /<tab>
    if (p && p !== "player") {
      if (p === "posts") {
        if (post) preserved.set("post", post);
        if (pt) preserved.set("pt", pt);
      }
      return redirect308(url, `/${encodeURIComponent(p)}`, preserved);
    }

    // pt-only -> /<pt>
    if (!p && pt) {
      if (post && pt === "posts") preserved.set("post", post);
      preserved.set("pt", pt);
      return redirect308(url, `/${encodeURIComponent(pt)}`, preserved);
    }
  }

  // ---- D) On canonical routes, strip legacy UI-surface params if present ----
  // This prevents old links from “dirtying” your canonical universe.
  if (url.searchParams.size > 0) {
    let hasLegacy = false;
    for (const k of url.searchParams.keys()) {
      if (STRIP_KEYS.has(k)) {
        hasLegacy = true;
        break;
      }
    }

    if (hasLegacy) {
      const filtered = filteredCanonicalParams(url);
      const current = new URLSearchParams(url.searchParams.toString());
      // If the filtered params differ, redirect to cleaned URL.
      if (!sameParams(filtered, current)) {
        return redirect308(url, pathname, filtered);
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};