// web/app/(site)/(session)/@runtime/album/[slug]/page.tsx
import React from "react";
import SessionRuntime from "../../SessionRuntime";

export const dynamic = "auto";

export default async function AlbumRuntimePage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const s = decodeURIComponent(slug ?? "").trim();
  return <SessionRuntime albumSlugOverride={s || null} />;
}
