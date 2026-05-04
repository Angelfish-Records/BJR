// web/app/(site)/player/page.tsx
import { redirect } from "next/navigation";
import { getFeaturedAlbumSlugFromSanity } from "@/lib/albums";
import { preservedQueryFromSearchParams } from "@/lib/nav/preservedQuery";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function PlayerAlias(props: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const sp = (props.searchParams ? await props.searchParams : {}) ?? {};

  const featured = await getFeaturedAlbumSlugFromSanity();
  const slug = featured.slug ?? featured.fallbackSlug ?? "god-defend";

  redirect(
    `/${encodeURIComponent(slug)}${preservedQueryFromSearchParams(sp)}`,
  );
}