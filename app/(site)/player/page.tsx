// web/app/(site)/player/page.tsx
import { redirect } from "next/navigation";
import { getFeaturedAlbumSlugFromSanity } from "@/lib/albums";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageSearchParams = Record<string, string | string[] | undefined>;

function first(sp: PageSearchParams | undefined, key: string): string {
  const v = sp?.[key];
  return Array.isArray(v)
    ? (v[0] ?? "").trim()
    : typeof v === "string"
      ? v.trim()
      : "";
}

function preservedQuery(sp: PageSearchParams | undefined): string {
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

export default async function PlayerAlias(props: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const sp = (props.searchParams ? await props.searchParams : {}) ?? {};

  const featured = await getFeaturedAlbumSlugFromSanity();
  const slug = featured.slug ?? featured.fallbackSlug ?? "consolers";

  redirect(`/album/${encodeURIComponent(slug)}${preservedQuery(sp)}`);
}