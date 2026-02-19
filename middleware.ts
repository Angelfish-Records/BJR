// web/middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const PRESERVE_PREFIXES = ["utm_"];

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

function withQuery(dest: URL, qp: URLSearchParams): URL {
  for (const [k, v] of qp.entries()) dest.searchParams.set(k, v);
  return dest;
}

function redirect308(reqUrl: URL, pathname: string, qp: URLSearchParams) {
  const dest = new URL(pathname, reqUrl.origin);
  withQuery(dest, qp);
  return NextResponse.redirect(dest, 308);
}

function splitPath(pathname: string): string[] {
  return (pathname ?? "").split("/").filter(Boolean);
}

export default clerkMiddleware((_, req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // ---- 0) /home -> /home/player (enter canonical universe immediately) ----
  if (pathname === "/home") {
    const preserved = pickBasePreservedParams(url);
    return redirect308(url, "/home/player", preserved);
  }

  // ---- 1) /albums (legacy) -> /album (canonical) ----
  // Supports:
  //   /albums/:slug
  //   /albums/:slug/track/:trackId
  // Also supports legacy ?track= query for /albums/:slug
  if (pathname.startsWith("/albums/")) {
    const parts = splitPath(pathname); // ["albums", ":slug", ...]
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

    // Base preserved (st/autoplay/utm)
    const preserved = pickBasePreservedParams(url);

    // /home?p=player&album=:slug&track=:id  ->  /album/:slug/track/:id
    if (p === "player" && album) {
      const targetPath = track
        ? `/album/${encodeURIComponent(album)}/track/${encodeURIComponent(track)}`
        : `/album/${encodeURIComponent(album)}`;
      return redirect308(url, targetPath, preserved);
    }

    // /home?p=<tab> -> /home/<tab>
    // Preserve post/pt *only* for posts migration so old deep links keep working.
    if (p && p !== "player") {
      if (p === "posts") {
        if (post) preserved.set("post", post);
        if (pt) preserved.set("pt", pt);
      }
      const targetPath = `/home/${encodeURIComponent(p)}`;
      return redirect308(url, targetPath, preserved);
    }

    // legacy pt-only (no p) -> /home/<pt>
    if (!p && pt) {
      // treat pt as portal tab
      if (post && pt === "posts") preserved.set("post", post);
      // keep pt as well (optional) — helpful if any client code still checks it
      preserved.set("pt", pt);
      const targetPath = `/home/${encodeURIComponent(pt)}`;
      return redirect308(url, targetPath, preserved);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};