// web/lib/checkoutReturnUrl.ts

const PRESERVE_PREFIXES = ["utm_"];
const PRESERVE_KEYS = new Set<string>([
  "st",
  "share",
  "autoplay",
  "post",
  "pt",
  "gift",
  "checkout",
]);
const STRIP_KEYS = new Set<string>(["p", "panel", "album", "track", "t"]);

function allowsVercelPreviewOrigin(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_VERCEL_PREVIEW_CHECKOUT_ORIGINS === "true"
  );
}

export function sameOriginOrAllowed(req: Request, appUrl: string): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  let app: URL;
  let requestOrigin: URL;

  try {
    app = new URL(appUrl);
    requestOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (requestOrigin.origin === app.origin) return true;

  const stripWww = (hostname: string) => hostname.replace(/^www\./, "");
  if (
    stripWww(requestOrigin.hostname) === stripWww(app.hostname) &&
    requestOrigin.protocol === app.protocol
  ) {
    return true;
  }

  return (
    allowsVercelPreviewOrigin() &&
    requestOrigin.hostname.endsWith(".vercel.app")
  );
}

function looksLikeSafeRelativePath(value: string): boolean {
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  return !value.toLowerCase().includes("://");
}

function isDisallowedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/studio") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/trpc")
  );
}

function pickPreservedParams(url: URL): URLSearchParams {
  const out = new URLSearchParams();

  const shareToken = (
    url.searchParams.get("st") ??
    url.searchParams.get("share") ??
    ""
  ).trim();
  if (shareToken) out.set("st", shareToken);

  const autoplay = (url.searchParams.get("autoplay") ?? "").trim();
  if (autoplay) out.set("autoplay", autoplay);

  for (const key of ["post", "pt", "gift", "checkout"] as const) {
    const value = (url.searchParams.get(key) ?? "").trim();
    if (value) out.set(key, value);
  }

  for (const [key, value] of url.searchParams.entries()) {
    if (PRESERVE_PREFIXES.some((prefix) => key.startsWith(prefix)) && value) {
      out.set(key, value);
    }
  }

  return out;
}

export function safeCheckoutReturnTo(
  appUrl: string,
  raw: unknown,
  fallbackPath: string,
): { pathname: string; params: URLSearchParams } {
  const fallback = { pathname: fallbackPath, params: new URLSearchParams() };

  if (typeof raw !== "string") return fallback;

  const value = raw.trim();
  if (!value || !looksLikeSafeRelativePath(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, appUrl);
  } catch {
    return fallback;
  }

  if (isDisallowedPath(url.pathname)) return fallback;

  const out = new URLSearchParams();
  const preserved = pickPreservedParams(url);

  for (const [key, value] of preserved.entries()) {
    if (STRIP_KEYS.has(key)) continue;

    if (
      PRESERVE_KEYS.has(key) ||
      PRESERVE_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      const trimmedValue = value.trim();
      if (trimmedValue) out.set(key, trimmedValue);
    }
  }

  const shareToken = (out.get("st") ?? out.get("share") ?? "").trim();
  out.delete("share");
  if (shareToken) out.set("st", shareToken);

  return { pathname: url.pathname, params: out };
}

export function buildCheckoutReturnUrl(
  appUrl: string,
  pathname: string,
  params: URLSearchParams,
  patch: Record<string, string | null | undefined>,
): string {
  const destination = new URL(pathname, appUrl);

  for (const [key, value] of params.entries()) {
    destination.searchParams.set(key, value);
  }

  for (const [key, value] of Object.entries(patch)) {
    const trimmedValue = value?.trim() ?? "";

    if (!trimmedValue) {
      destination.searchParams.delete(key);
    } else {
      destination.searchParams.set(key, trimmedValue);
    }
  }

  return destination.toString();
}
