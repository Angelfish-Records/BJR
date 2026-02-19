// web/app/(site)/albums/[slug]/page.tsx
import { redirect } from "next/navigation";

type PageSearchParams = Record<string, string | string[] | undefined>;

function first(sp: PageSearchParams | undefined, key: string): string {
  const v = sp?.[key];
  return Array.isArray(v) ? (v[0] ?? "").trim() : typeof v === "string" ? v.trim() : "";
}

function preservedQuery(sp: PageSearchParams | undefined): string {
  const out = new URLSearchParams();

  const st = first(sp, "st") || first(sp, "share");
  if (st) out.set("st", st);

  const autoplay = first(sp, "autoplay");
  if (autoplay) out.set("autoplay", autoplay);

  for (const [k, raw] of Object.entries(sp ?? {})) {
    if (!k.startsWith("utm_")) continue;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v === "string" && v.trim()) out.set(k, v.trim());
  }

  const qs = out.toString();
  return qs ? `?${qs}` : "";
}

export default async function AlbumLegacyRedirect(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<PageSearchParams>;
}) {
  const { slug } = await props.params;
  const sp = (props.searchParams ? await props.searchParams : {}) ?? {};

  const trackId = first(sp, "track");

  const base = trackId
    ? `/album/${encodeURIComponent(slug)}/track/${encodeURIComponent(trackId)}`
    : `/album/${encodeURIComponent(slug)}`;

  redirect(`${base}${preservedQuery(sp)}`);
}
