// web/app/(site)/(session)/@runtime/album/[slug]/page.tsx
import React from "react";
import SessionRuntime from "../../SessionRuntime";

export default async function AlbumRuntimePage(
  props: Readonly<{
    params: Promise<{ slug: string }>;
  }>,
) {
  const { slug } = await props.params;
  const resolvedSlug = decodeURIComponent(slug ?? "").trim() || null;

  return <SessionRuntime albumSlugOverride={resolvedSlug} />;
}
