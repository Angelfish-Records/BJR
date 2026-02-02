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

export function buildShareTarget(
  input:
    | {
        type: "album";
        methodHint?: ShareMethod;
        origin?: string;
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
        post: { slug: string; title?: string; id?: string };
        // optional if you want nicer copy like “New note” vs “Post”
        authorName?: string;
      },
): ShareTarget {
  const origin = getOrigin(input.origin);
  const method = input.methodHint ?? "copy";

  if (input.type === "post") {
    const postTitle = input.post.title?.trim() || "Post";
    const basePath = `/posts/${encodeURIComponent(input.post.slug)}`;
    const baseAbs = origin ? `${origin}${basePath}` : basePath;
    const url = origin
      ? addUtm(new URL(baseAbs), method, "post").toString()
      : baseAbs;

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
  const basePath = `/albums/${encodeURIComponent(input.album.slug)}`;
  const baseAbs = origin ? `${origin}${basePath}` : basePath;

  if (input.type === "album") {
    const url = origin
      ? addUtm(new URL(baseAbs), method, "album").toString()
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

  const trackTitle = input.track.title?.trim() || "Track";
  const abs = origin ? new URL(baseAbs) : null;
  if (abs) {
    abs.searchParams.set("t", input.track.id);
    addUtm(abs, method, "track");
  }

  const url = abs
    ? abs.toString()
    : `${baseAbs}?t=${encodeURIComponent(input.track.id)}`;
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

function encodeShareText(target: ShareTarget) {
  return `${target.text}\n${target.url}`.trim();
}

export type ShareIntentId =
  | "whatsapp"
  | "instagram"
  | "signal"
  | "telegram"
  | "email"
  | "x"
  | "messenger"
  | "snapchat"
  | "discord";

export type ShareIntent = {
  id: ShareIntentId;
  label: string;
  href: string;
  note?: string;
};

function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}
function isiOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

/**
 * IMPORTANT:
 * - WhatsApp / Telegram / Email / X are reliable.
 * - Instagram / Snapchat / Signal are "open app" best-effort, not “direct send”.
 * - Messenger is inconsistent; web flow often forces login.
 * - Discord can’t receive a prefilled message from web reliably; open app and paste.
 */
export function getShareIntents(target: ShareTarget): ShareIntent[] {
  const shareText = encodeShareText(target);
  const msg = encodeURIComponent(shareText);

  const subj = encodeURIComponent(target.title);
  const body = encodeURIComponent(shareText);

  const urlEnc = encodeURIComponent(target.url);
  const textEnc = encodeURIComponent(target.text);

  const intents: ShareIntent[] = [
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${msg}` },

    ...(isAndroid()
      ? [
          {
            id: "instagram" as const,
            label: "Instagram",
            href: `intent://#Intent;package=com.instagram.android;scheme=https;end`,
            note: "Opens app (paste link)",
          },
        ]
      : [
          {
            id: "instagram" as const,
            label: "Instagram",
            href: `instagram://app`,
            note: "Opens app (paste link)",
          },
        ]),

    ...(isAndroid()
      ? [
          {
            id: "signal" as const,
            label: "Signal",
            href: `intent://#Intent;package=org.thoughtcrime.securesms;scheme=signal;end`,
            note: "Opens app (paste link)",
          },
        ]
      : [
          {
            id: "signal" as const,
            label: "Signal",
            href: `sgnl://`,
            note: "Opens app (paste link)",
          },
        ]),

    {
      id: "telegram",
      label: "Telegram",
      href: `https://t.me/share/url?url=${urlEnc}&text=${textEnc}`,
    },

    {
      id: "email",
      label: "Email",
      href: `mailto:?subject=${subj}&body=${body}`,
    },

    {
      id: "x",
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${textEnc}&url=${urlEnc}`,
    },

    {
      id: "messenger",
      label: "Messenger",
      href: isiOS()
        ? `fb-messenger://share?link=${urlEnc}`
        : `https://www.facebook.com/dialog/send?link=${urlEnc}`,
      note: "May prompt login",
    },

    // Extra: hip hop fans absolutely use Discord + Snapchat.
    {
      id: "discord",
      label: "Discord",
      href: `discord://`,
      note: "Opens app (paste link)",
    },

    ...(isAndroid()
      ? [
          {
            id: "snapchat" as const,
            label: "Snapchat",
            href: `intent://#Intent;package=com.snapchat.android;scheme=https;end`,
            note: "Opens app (paste link)",
          },
        ]
      : [
          {
            id: "snapchat" as const,
            label: "Snapchat",
            href: `snapchat://`,
            note: "Opens app (paste link)",
          },
        ]),
  ];

  const seen = new Set<string>();
  return intents.filter((x) =>
    seen.has(x.id) ? false : (seen.add(x.id), true),
  );
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
        } catch {
          // fall through
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
