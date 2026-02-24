// web/lib/nav/preservedQuery.ts
export type PageSearchParams = Record<string, string | string[] | undefined>;

function first(sp: PageSearchParams | undefined, key: string): string {
  const v = sp?.[key];
  return Array.isArray(v)
    ? (v[0] ?? "").trim()
    : typeof v === "string"
      ? v.trim()
      : "";
}

/** Server: feed Next.js `searchParams` (object form). Returns "" or "?a=b". */
export function preservedQueryFromSearchParams(
  sp: PageSearchParams | undefined,
): string {
  const out = new URLSearchParams();

  const st = first(sp, "st") || first(sp, "share");
  if (st) out.set("st", st);

  const autoplay = first(sp, "autoplay");
  if (autoplay) out.set("autoplay", autoplay);

  const post = first(sp, "post");
  if (post) out.set("post", post);
  const pt = first(sp, "pt");
  if (pt) out.set("pt", pt);

  const gift = first(sp, "gift");
  if (gift) out.set("gift", gift);
  const checkout = first(sp, "checkout");
  if (checkout) out.set("checkout", checkout);

  for (const [k, raw] of Object.entries(sp ?? {})) {
    if (!k.startsWith("utm_")) continue;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v === "string" && v.trim()) out.set(k, v.trim());
  }

  const qs = out.toString();
  return qs ? `?${qs}` : "";
}

/** Client: reads window.location.search. Returns "" or "?a=b". */
export function preservedQueryFromLocation(): string {
  if (typeof window === "undefined") return "";
  const sp = new URLSearchParams(window.location.search);
  const out = new URLSearchParams();

  const st = (sp.get("st") || sp.get("share") || "").trim();
  if (st) out.set("st", st);

  const autoplay = (sp.get("autoplay") || "").trim();
  if (autoplay) out.set("autoplay", autoplay);

  const post = (sp.get("post") || "").trim();
  if (post) out.set("post", post);
  const pt = (sp.get("pt") || "").trim();
  if (pt) out.set("pt", pt);

  const gift = (sp.get("gift") || "").trim();
  if (gift) out.set("gift", gift);
  const checkout = (sp.get("checkout") || "").trim();
  if (checkout) out.set("checkout", checkout);

  for (const [k, v] of sp.entries()) {
    if (!k.startsWith("utm_")) continue;
    const s = (v || "").trim();
    if (s) out.set(k, s);
  }

  const qs = out.toString();
  return qs ? `?${qs}` : "";
}