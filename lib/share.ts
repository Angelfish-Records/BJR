// web/lib/share.ts

export type ShareMethod = "native" | "copy" | "sheet" | "intent";

export type ShareTarget =
  | {
      type: "album";
      albumSlug: string;
      albumId?: string;
      title: string;
      text: string;
      url: string;
    }
  | {
      type: "track";
      albumSlug: string;
      albumId?: string;
      trackId: string;
      trackTitle: string;
      title: string;
      text: string;
      url: string;
    }
  | {
      type: "post";
      postSlug: string;
      postId?: string;
      title: string;
      text: string;
      url: string;
    };

function stripTrailingSlash(s: string) {
  return s.replace(/\/+$/, "");
}

export function getOrigin(explicitOrigin?: string) {
  if (explicitOrigin) return stripTrailingSlash(explicitOrigin);
  if (typeof window !== "undefined" && window.location?.origin)
    return window.location.origin;
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return stripTrailingSlash(env);
  return "";
}

function addUtm(
  u: URL,
  method: ShareMethod,
  targetType: "album" | "track" | "post",
) {
  u.searchParams.set("utm_source", "share");
  u.searchParams.set("utm_medium", method);
  u.searchParams.set("utm_campaign", targetType);
  return u;
}

function maybeAddSt(u: URL, st?: string) {
  const v = (st ?? "").trim();
  if (v) u.searchParams.set("st", v);
  return u;
}

function encodePathSeg(s: string) {
  return encodeURIComponent(s);
}

export function buildShareTarget(
  input:
    | {
        type: "album";
        methodHint?: ShareMethod;
        origin?: string;
        st?: string;
        album: {
          slug: string;
          title: string;
          artistName?: string;
          id?: string;
        };
      }
    | {
        type: "track";
        methodHint?: ShareMethod;
        origin?: string;
        st?: string;
        album: {
          slug: string;
          title: string;
          artistName?: string;
          id?: string;
        };
        track: { id: string; title: string };
      }
    | {
        type: "post";
        methodHint?: ShareMethod;
        origin?: string;
        st?: string;
        post: { slug: string; title?: string; id?: string };
        authorName?: string;
      },
): ShareTarget {
  const origin = getOrigin(input.origin);
  const method = input.methodHint ?? "copy";

  if (input.type === "post") {
    const postTitle = input.post.title?.trim() || "Post";
    const basePath = `/posts/${encodePathSeg(input.post.slug)}`;
    const baseAbs = origin ? `${origin}${basePath}` : basePath;

    const abs = origin ? new URL(baseAbs) : null;
    if (abs) {
      maybeAddSt(abs, input.st);
      addUtm(abs, method, "post");
    }

    const url = abs ? abs.toString() : baseAbs;

    const who = input.authorName?.trim();
    const title = who ? `${postTitle} — ${who}` : postTitle;
    const text = who ? `Read “${postTitle}” by ${who}` : `Read “${postTitle}”`;

    return {
      type: "post",
      postSlug: input.post.slug,
      postId: input.post.id,
      title,
      text,
      url,
    };
  }

  const artist = input.album.artistName?.trim();
  const albumTitle = input.album.title?.trim() || "Album";

  // ✅ canonical album base path
  const basePath = `/album/${encodePathSeg(input.album.slug)}`;
  const baseAbs = origin ? `${origin}${basePath}` : basePath;

  if (input.type === "album") {
    const url = origin
      ? addUtm(maybeAddSt(new URL(baseAbs), input.st), method, "album").toString()
      : baseAbs;

    const title = artist ? `${artist} — ${albumTitle}` : albumTitle;
    const text = artist
      ? `Listen to ${albumTitle} by ${artist}`
      : `Listen to ${albumTitle}`;

    return {
      type: "album",
      albumSlug: input.album.slug,
      albumId: input.album.id,
      title,
      text,
      url,
    };
  }

  // ✅ canonical track path (no query-based player state)
  const trackTitle = input.track.title?.trim() || "Track";
  const trackPath = `/album/${encodePathSeg(input.album.slug)}/track/${encodePathSeg(
    input.track.id,
  )}`;
  const trackAbs = origin ? `${origin}${trackPath}` : trackPath;

  const url = origin
    ? addUtm(maybeAddSt(new URL(trackAbs), input.st), method, "track").toString()
    : trackAbs;

  const title = artist
    ? `${trackTitle} — ${albumTitle} — ${artist}`
    : `${trackTitle} — ${albumTitle}`;
  const text = artist
    ? `Listen to “${trackTitle}” on ${albumTitle} by ${artist}`
    : `Listen to “${trackTitle}” on ${albumTitle}`;

  return {
    type: "track",
    albumSlug: input.album.slug,
    albumId: input.album.id,
    trackId: input.track.id,
    trackTitle,
    title,
    text,
    url,
  };
}

export type ShareResult =
  | { ok: true; method: "native" | "copy"; url: string }
  | { ok: false; reason: "clipboard_unavailable" | "failed"; url: string };

function isAbortError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { name?: unknown; message?: unknown };
  return anyErr.name === "AbortError";
}

export async function performShare(target: ShareTarget): Promise<ShareResult> {
  const url = target.url;

  if (typeof navigator !== "undefined") {
    const nav = navigator as Navigator & {
      share?: (data: {
        title?: string;
        text?: string;
        url?: string;
      }) => Promise<void>;
      canShare?: (data?: {
        title?: string;
        text?: string;
        url?: string;
        files?: File[];
      }) => boolean;
    };

    if (typeof nav.share === "function") {
      const payload = { title: target.title, text: target.text, url };
      if (typeof nav.canShare !== "function" || nav.canShare(payload)) {
        try {
          await nav.share(payload);
          return { ok: true, method: "native", url };
        } catch (err) {
          if (isAbortError(err)) {
            return { ok: false, reason: "failed", url };
          }
          // fall through to clipboard
        }
      }
    }
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return { ok: true, method: "copy", url };
    }
    return { ok: false, reason: "clipboard_unavailable", url };
  } catch {
    return { ok: false, reason: "failed", url };
  }
}
