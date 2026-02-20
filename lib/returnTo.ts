// web/lib/returnTo.ts
import "server-only";

const PRESERVE_PREFIXES = ["utm_"];
const PRESERVE_KEYS = new Set(["st", "autoplay", "post", "pt", "gift", "checkout"]);
const STRIP_KEYS = new Set(["p", "panel", "album", "track", "t", "share"]);

function splitPath(pathname: string): string[] {
  return (pathname ?? "").split("/").filter(Boolean);
}

// Keep this conservative: only allow your canonical surfaces.
function isAllowedPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/player") return true;
  if (pathname === "/posts" || pathname === "/extras" || pathname === "/download") return true; // extend to your real tab ids
  if (pathname.startsWith("/album/")) return true;
  // allow generic tab root-level pages: "/<tab>"
  const parts = splitPath(pathname);
  if (parts.length === 1) return true;
  // allow "/album/:slug/track/:id"
  if (parts[0] === "album" && parts[2] === "track" && parts[3]) return true;
  return false;
}

function sanitizeParams(u: URL): URLSearchParams {
  const out = new URLSearchParams();

  // normalize share -> st
  const st = (u.searchParams.get("st") ?? u.searchParams.get("share") ?? "").trim();
  if (st) out.set("st", st);

  const autoplay = (u.searchParams.get("autoplay") ?? "").trim();
  if (autoplay) out.set("autoplay", autoplay);

  for (const k of ["post", "pt"] as const) {
    const v = (u.searchParams.get(k) ?? "").trim();
    if (v) out.set(k, v);
  }

  for (const [k, v] of u.searchParams.entries()) {
    if (STRIP_KEYS.has(k)) continue;
    if (PRESERVE_KEYS.has(k)) continue; // handled explicitly above
    if (PRESERVE_PREFIXES.some((p) => k.startsWith(p)) && v) out.set(k, v);
  }

  return out;
}

export function safeReturnToFromBody(
  appUrl: string,
  raw: unknown,
  fallbackPath: string,
): { pathname: string; params: URLSearchParams } {
  const fallback = { pathname: fallbackPath, params: new URLSearchParams() };

  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!s) return fallback;

  // Only allow same-origin relative paths ("/...").
  if (!s.startsWith("/")) return fallback;

  let u: URL;
  try {
    u = new URL(s, appUrl);
  } catch {
    return fallback;
  }

  if (!isAllowedPath(u.pathname)) return fallback;

  return { pathname: u.pathname, params: sanitizeParams(u) };
}

export function buildReturnUrl(
  appUrl: string,
  pathname: string,
  params: URLSearchParams,
  patch: Record<string, string | null | undefined>,
): string {
  const dest = new URL(pathname, appUrl);
  for (const [k, v] of params.entries()) dest.searchParams.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (!v) dest.searchParams.delete(k);
    else dest.searchParams.set(k, v);
  }
  return dest.toString();
}