// web/middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const PRESERVE_PREFIXES = ["utm_"];

function pickPreservedParams(url: URL): URLSearchParams {
  const out = new URLSearchParams();

  // share token canonical key = st
  const st = (url.searchParams.get("st") ?? url.searchParams.get("share") ?? "").trim();
  if (st) out.set("st", st);

  // optional autoplay
  const autoplay = (url.searchParams.get("autoplay") ?? "").trim();
  if (autoplay) out.set("autoplay", autoplay);

  // utm_*
  for (const [k, v] of url.searchParams.entries()) {
    if (PRESERVE_PREFIXES.some((p) => k.startsWith(p)) && v) out.set(k, v);
  }

  return out;
}

function withPreservedQuery(dest: URL, preserved: URLSearchParams): URL {
  for (const [k, v] of preserved.entries()) dest.searchParams.set(k, v);
  return dest;
}

function redirect308(reqUrl: URL, pathname: string, preserved: URLSearchParams) {
  const dest = new URL(pathname, reqUrl.origin);
  withPreservedQuery(dest, preserved);
  return NextResponse.redirect(dest, 308);
}

export default clerkMiddleware((_, req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // ---- 1) /albums (legacy segment) -> /album (canonical segment) ----
  // Supports old ?track= query and preserves secondary params.
  if (pathname.startsWith("/albums/")) {
    const slug = pathname.slice("/albums/".length).split("/")[0] ?? "";
    if (slug) {
      const preserved = pickPreservedParams(url);
      const track = (url.searchParams.get("track") ?? "").trim();

      const targetPath = track
        ? `/album/${encodeURIComponent(slug)}/track/${encodeURIComponent(track)}`
        : `/album/${encodeURIComponent(slug)}`;

      return redirect308(url, targetPath, preserved);
    }
  }

  // ---- 2) Legacy query-world /home?p=... -> canonical paths ----
  if (pathname === "/home" || pathname.startsWith("/home/")) {
    const p = (url.searchParams.get("p") ?? "").trim();
    const album = (url.searchParams.get("album") ?? "").trim();
    const track = (url.searchParams.get("track") ?? "").trim();
    const post = (url.searchParams.get("post") ?? "").trim();

    const preserved = pickPreservedParams(url);

    // /home?p=player&album=:slug&track=:id  ->  /album/:slug/track/:id
    if (p === "player" && album) {
      const targetPath = track
        ? `/album/${encodeURIComponent(album)}/track/${encodeURIComponent(track)}`
        : `/album/${encodeURIComponent(album)}`;
      return redirect308(url, targetPath, preserved);
    }

    // /home?p=posts -> /home/posts (path-native portal tab)
    // Deep-open behaviour will be handled in the portal posts surface; we preserve only
    // secondary params and drop post from the URL in Phase 1 (we’ll make /posts/:slug canonical separately).
    if (p === "posts") {
      // If you later decide the canonical should be /posts/:slug, we’ll add that rule too.
      const targetPath = "/home/posts";
      // (Optional) If you want to keep deep-open as a *temporary* query param during migration,
      // you can re-add `post` here — but your plan says avoid it long-term.
      // if (post) preserved.set("post", post);
      return redirect308(url, targetPath, preserved);
    }

    // If it's some other p=..., canonicalize to path-based tabs when you create them.
    // For now, don’t guess — let it fall through.
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
