// web/middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const PRESERVE_PREFIXES = ["utm_"];

function getClerkAuthorizedParties(): string[] | undefined {
  const raw = (process.env.CLERK_AUTHORIZED_PARTIES ?? "").trim();
  if (!raw) return undefined;

  const parties = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return parties.length > 0 ? parties : undefined;
}

// Query keys that are allowed to survive canonicalization.
const PRESERVE_KEYS = new Set<string>([
  "st",
  "share",
  "autoplay",
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
  const st = (
    url.searchParams.get("st") ??
    url.searchParams.get("share") ??
    ""
  ).trim();
  if (st) out.set("st", st);

  // keep autoplay if present
  const autoplay = (url.searchParams.get("autoplay") ?? "").trim();
  if (autoplay) out.set("autoplay", autoplay);

  // preserve secondary keys we actively use
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
    if (
      PRESERVE_KEYS.has(k) ||
      PRESERVE_PREFIXES.some((p) => k.startsWith(p))
    ) {
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
  if (a.size !== b.size) return false;
  for (const [k, v] of a.entries()) {
    if (b.get(k) !== v) return false;
  }
  return true;
}

function redirect308(reqUrl: URL, pathname: string, qp: URLSearchParams) {
  const dest = new URL(pathname, reqUrl.origin);
  for (const [k, v] of qp.entries()) dest.searchParams.set(k, v);

  const res = NextResponse.redirect(dest, 308);
  res.headers.set("x-af-mw-redirect", `${reqUrl.pathname} -> ${dest.pathname}`);
  return res;
}

function rewriteTo(reqUrl: URL, pathname: string) {
  const dest = new URL(reqUrl.toString());
  dest.pathname = pathname;
  const res = NextResponse.rewrite(dest);
  res.headers.set("x-af-mw-rewrite", `${reqUrl.pathname} -> ${dest.pathname}`);
  return res;
}

// Roots that must never be interpreted as music slugs.
const RESERVED_ROOTS = new Set<string>([
  // system / infra
  "api",
  "admin",
  "_next",
  "trpc",
  "studio",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",

  // your canonical surfaces / tabs
  "portal",
  "journal",
  "player",
  "download",
  "gift",
  "posts", // legacy tab
  "extras", // legacy tab

  // other known surfaces you use in-repo
  "exegesis",
]);

function resolveRootAndLegacyHome(url: URL): NextResponse | null {
  const pathname = url.pathname;

  // Route the public root through the dynamic player alias. /player then
  // resolves the current featured album and redirects to its canonical URL.
  if (pathname === "/") {
    return rewriteTo(url, "/player");
  }

  if (pathname === "/home") {
    return redirect308(url, "/", pickPreservedParams(url));
  }

  if (pathname === "/home/player") {
    return redirect308(url, "/player", pickPreservedParams(url));
  }

  if (!pathname.startsWith("/home/")) {
    return null;
  }

  const parts = splitPath(pathname); // ["home", "<tab>", ...]
  const tab = (parts[1] ?? "").trim();

  return redirect308(
    url,
    tab ? `/${encodeURIComponent(tab)}` : "/portal",
    pickPreservedParams(url),
  );
}

function resolveLegacyAlbumRoute(url: URL): NextResponse | null {
  const pathname = url.pathname;

  if (!pathname.startsWith("/albums/")) {
    return null;
  }

  const parts = splitPath(pathname); // ["albums", ":slug", ...]
  const slug = (parts[1] ?? "").trim();

  if (!slug) {
    return null;
  }

  const preserved = pickPreservedParams(url);

  // /albums/:slug/track/:displayId -> /:slug/:displayId
  if ((parts[2] ?? "") === "track" && parts[3]) {
    return redirect308(
      url,
      `/${encodeURIComponent(slug)}/${encodeURIComponent(parts[3])}`,
      preserved,
    );
  }

  // /albums/:slug?track=... -> /:slug/:displayId
  const trackQuery = (url.searchParams.get("track") ?? "").trim();

  if (trackQuery) {
    return redirect308(
      url,
      `/${encodeURIComponent(slug)}/${encodeURIComponent(trackQuery)}`,
      preserved,
    );
  }

  // /albums/:slug -> /:slug
  return redirect308(url, `/${encodeURIComponent(slug)}`, preserved);
}

function hasLegacyQueryParams(searchParams: URLSearchParams): boolean {
  for (const key of searchParams.keys()) {
    if (STRIP_KEYS.has(key)) {
      return true;
    }
  }

  return false;
}

function resolveCanonicalQueryRedirect(url: URL): NextResponse | null {
  if (url.searchParams.size === 0 || !hasLegacyQueryParams(url.searchParams)) {
    return null;
  }

  const filtered = filteredCanonicalParams(url);
  const current = new URLSearchParams(url.searchParams.toString());

  if (sameParams(filtered, current)) {
    return null;
  }

  return redirect308(url, url.pathname, filtered);
}

function resolvePrettyMusicRoute(url: URL): NextResponse | null {
  const parts = splitPath(url.pathname);

  // Only root-level one- or two-segment paths qualify.
  if (parts.length !== 1 && parts.length !== 2) {
    return null;
  }

  const first = (parts[0] ?? "").trim().toLowerCase();

  if (!first || RESERVED_ROOTS.has(first)) {
    return null;
  }

  // Keep segments exactly as encoded in the incoming URL.
  const slugSegment = parts[0];

  if (parts.length === 1) {
    // Public canonical: /:slug
    // Internal page target remains /album/:slug for now.
    return rewriteTo(url, `/album/${slugSegment}`);
  }

  const displaySegment = parts[1];

  // Public canonical: /:slug/:displayId
  // Internal page target remains /album/:slug/track/:displayId for now.
  return rewriteTo(url, `/album/${slugSegment}/track/${displaySegment}`);
}

function resolveMiddlewareResponse(url: URL): NextResponse | null {
  return (
    resolveRootAndLegacyHome(url) ??
    resolveLegacyAlbumRoute(url) ??
    resolveCanonicalQueryRedirect(url) ??
    resolvePrettyMusicRoute(url)
  );
}

export default clerkMiddleware(
  (auth, req) => {
    // Force Clerk to initialize on every matched request.
    auth();

    const url = new URL(req.url);

    return resolveMiddlewareResponse(url) ?? NextResponse.next();
  },
  {
    authorizedParties: getClerkAuthorizedParties(),
  },
);

export const config = {
  matcher: ["/((?!_next|.*[.].*).*)", "/api/(.*)", "/trpc/(.*)"],
};
