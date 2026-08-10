// web/app/(site)/(session)/@runtime/album/[slug]/track/[displayId]/page.tsx
import React from "react";
import SessionRuntime from "../../../../SessionRuntime";

export default async function AlbumTrackRuntimePage(
  props: Readonly<{
    params: Promise<{ slug: string; displayId: string }>;
  }>,
) {
  const { slug } = await props.params;
  const resolvedSlug = decodeURIComponent(slug ?? "").trim() || null;

  // Important: album track route identity is now split by design:
  // - runtime loads the selected album bundle
  // - the persistent shell parses pathname displayId client-side
  //   and reconciles track selection from route.displayId
  return <SessionRuntime albumSlugOverride={resolvedSlug} />;
}
