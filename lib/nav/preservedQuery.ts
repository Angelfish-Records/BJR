// web/lib/nav/preservedQuery.ts
export type PageSearchParams = Record<string, string | string[] | undefined>;

type PreservedQueryReader = {
  get: (key: string) => string;
  entries: () => Iterable<[string, string]>;
};

const DIRECT_PRESERVED_KEYS = [
  "autoplay",
  "post",
  "pt",
  "gift",
  "checkout",
  "purchase",
  "purchaseAlbum",
] as const;

function first(sp: PageSearchParams | undefined, key: string): string {
  const value = sp?.[key];

  return Array.isArray(value)
    ? (value[0] ?? "").trim()
    : typeof value === "string"
      ? value.trim()
      : "";
}

function queryStringFromParams(params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function buildPreservedQuery(reader: PreservedQueryReader): string {
  const out = new URLSearchParams();

  const shareToken = reader.get("st") || reader.get("share");
  if (shareToken) out.set("st", shareToken);

  for (const key of DIRECT_PRESERVED_KEYS) {
    const value = reader.get(key);
    if (value) out.set(key, value);
  }

  for (const [key, value] of reader.entries()) {
    if (key.startsWith("utm_") && value.trim()) {
      out.set(key, value.trim());
    }
  }

  return queryStringFromParams(out);
}

/** Server: feed Next.js `searchParams` object form. Returns "" or "?a=b". */
export function preservedQueryFromSearchParams(
  sp: PageSearchParams | undefined,
): string {
  return buildPreservedQuery({
    get: (key) => first(sp, key),
    entries: () =>
      Object.entries(sp ?? {}).flatMap(([key, raw]) => {
        const value = Array.isArray(raw) ? raw[0] : raw;
        return typeof value === "string" ? [[key, value] as const] : [];
      }),
  });
}

/** Client: reads window.location.search. Returns "" or "?a=b". */
export function preservedQueryFromLocation(): string {
  if (typeof window === "undefined") return "";

  const sp = new URLSearchParams(window.location.search);

  return buildPreservedQuery({
    get: (key) => (sp.get(key) ?? "").trim(),
    entries: () => sp.entries(),
  });
}
