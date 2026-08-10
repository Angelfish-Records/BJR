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
      recordingId: string;
      displayId: string;
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

type AlbumShareInput = {
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
};

type TrackShareInput = {
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
  track: {
    recordingId: string;
    displayId: string;
    title: string;
  };
};

type PostShareInput = {
  type: "post";
  methodHint?: ShareMethod;
  origin?: string;
  st?: string;
  post: {
    slug: string;
    title?: string;
    id?: string;
  };
  authorName?: string;
};

type ShareInput = AlbumShareInput | TrackShareInput | PostShareInput;
type AlbumLikeShareInput = AlbumShareInput | TrackShareInput;
type ShareTargetType = ShareTarget["type"];

function stripTrailingSlash(s: string) {
  let end = s.length;
  while (end > 0 && s.codePointAt(end - 1) === 47) {
    end -= 1;
  }
  return s.slice(0, end);
}

export function getOrigin(explicitOrigin?: string) {
  if (explicitOrigin) return stripTrailingSlash(explicitOrigin);
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return stripTrailingSlash(env);
  return "";
}

function addUtm(
  u: URL,
  method: ShareMethod,
  targetType: ShareTargetType,
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

function buildShareUrl(params: {
  origin: string;
  basePath: string;
  st?: string;
  method: ShareMethod;
  targetType: ShareTargetType;
}): string {
  if (!params.origin) {
    return params.basePath;
  }

  const absoluteUrl = new URL(`${params.origin}${params.basePath}`);
  maybeAddSt(absoluteUrl, params.st);
  addUtm(absoluteUrl, params.method, params.targetType);
  return absoluteUrl.toString();
}

function resolveAlbumDisplayTitle(
  rawTitle: string | null | undefined,
): string {
  const albumTitleRaw = (rawTitle ?? "").toString().trim();

  if (albumTitleRaw.length === 0) {
    return "Album";
  }

  return albumTitleRaw;
}

function buildPostShareTarget(
  input: PostShareInput,
  origin: string,
  method: ShareMethod,
): ShareTarget {
  const postTitle = input.post.title?.trim() || "Post";
  const basePath = `/journal?post=${encodePathSeg(input.post.slug)}`;
  const url = buildShareUrl({
    origin,
    basePath,
    st: input.st,
    method,
    targetType: "post",
  });

  const who = input.authorName?.trim();
  const title = who ? `${postTitle} · ${who}` : postTitle;
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

function albumShareMetadata(input: AlbumLikeShareInput): {
  artist: string | undefined;
  albumTitle: string;
  basePath: string;
} {
  const artist = input.album.artistName?.trim();
  const albumTitle = resolveAlbumDisplayTitle(input.album.title);
  const basePath = `/${encodePathSeg(input.album.slug)}`;

  return { artist, albumTitle, basePath };
}

function buildAlbumShareTarget(
  input: AlbumShareInput,
  origin: string,
  method: ShareMethod,
): ShareTarget {
  const { artist, albumTitle, basePath } = albumShareMetadata(input);
  const url = buildShareUrl({
    origin,
    basePath,
    st: input.st,
    method,
    targetType: "album",
  });

  const title = artist ? `${artist} · ${albumTitle}` : albumTitle;
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

function buildTrackShareTarget(
  input: TrackShareInput,
  origin: string,
  method: ShareMethod,
): ShareTarget {
  const { artist, albumTitle } = albumShareMetadata(input);
  const trackTitle = input.track.title?.trim() || "Track";
  const trackPath = `/${encodePathSeg(input.album.slug)}/${encodePathSeg(
    input.track.displayId,
  )}`;
  const url = buildShareUrl({
    origin,
    basePath: trackPath,
    st: input.st,
    method,
    targetType: "track",
  });

  const title = artist
    ? `${trackTitle} · ${albumTitle} · ${artist}`
    : `${trackTitle} · ${albumTitle}`;
  const text = artist
    ? `Listen to “${trackTitle}” on ${albumTitle} by ${artist}`
    : `Listen to “${trackTitle}” on ${albumTitle}`;

  return {
    type: "track",
    albumSlug: input.album.slug,
    albumId: input.album.id,
    recordingId: input.track.recordingId,
    displayId: input.track.displayId,
    trackTitle,
    title,
    text,
    url,
  };
}

export function buildShareTarget(input: ShareInput): ShareTarget {
  const origin = getOrigin(input.origin);
  const method = input.methodHint ?? "copy";

  if (input.type === "post") {
    return buildPostShareTarget(input, origin, method);
  }

  if (input.type === "album") {
    return buildAlbumShareTarget(input, origin, method);
  }

  return buildTrackShareTarget(input, origin, method);
}

export type ShareResult =
  | { ok: true; method: "native" | "copy"; url: string }
  | { ok: false; reason: "clipboard_unavailable" | "failed"; url: string };

type ShareNavigator = Navigator & {
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

function isAbortError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const errorRecord = err as { name?: unknown };
  return errorRecord.name === "AbortError";
}

async function tryNativeShare(
  target: ShareTarget,
): Promise<ShareResult | null> {
  if (typeof navigator === "undefined") {
    return null;
  }

  const nav = navigator as ShareNavigator;
  if (typeof nav.share !== "function") {
    return null;
  }

  const payload = {
    title: target.title,
    text: target.text,
    url: target.url,
  };

  if (typeof nav.canShare === "function" && !nav.canShare(payload)) {
    return null;
  }

  try {
    await nav.share(payload);
    return { ok: true, method: "native", url: target.url };
  } catch (err) {
    if (isAbortError(err)) {
      return { ok: false, reason: "failed", url: target.url };
    }

    return null;
  }
}

async function copyShareUrl(url: string): Promise<ShareResult> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return { ok: false, reason: "clipboard_unavailable", url };
    }

    await navigator.clipboard.writeText(url);
    return { ok: true, method: "copy", url };
  } catch {
    return { ok: false, reason: "failed", url };
  }
}

export async function performShare(target: ShareTarget): Promise<ShareResult> {
  const nativeResult = await tryNativeShare(target);
  if (nativeResult) {
    return nativeResult;
  }

  return copyShareUrl(target.url);
}
