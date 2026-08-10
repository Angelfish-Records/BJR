// web/app/(site)/(session)/@runtime/[tab]/page.tsx
import React from "react";
import SessionRuntime from "../SessionRuntime";

export default async function PortalRuntimePage(
  props: Readonly<{
    params: Promise<{ tab: string }>;
  }>,
) {
  const { tab } = await props.params;
  const resolvedTab = decodeURIComponent(tab ?? "").trim() || null;

  // Important: for portal routes we still want an album context to exist
  // (queue priming, stage, etc). SessionRuntime will resolve the selected album
  // from the shell-provided featured album fallback when no route album is supplied.
  return (
    <SessionRuntime albumSlugOverride={null} initialPortalTabId={resolvedTab} />
  );
}
