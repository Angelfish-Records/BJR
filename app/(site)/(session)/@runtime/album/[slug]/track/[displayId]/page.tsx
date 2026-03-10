// web/app/(site)/(session)/@runtime/album/[slug]/track/[displayId]/page.tsx
import React from "react";
import SessionRuntime from "../../../../SessionRuntime";

export default async function AlbumTrackRuntimePage(props: {
  params: Promise<{ slug: string; displayId: string }>;
}) {
  const { slug } = await props.params;
  const resolvedSlug = decodeURIComponent(slug ?? "").trim() || null;

  return <SessionRuntime albumSlugOverride={resolvedSlug} />;
}
