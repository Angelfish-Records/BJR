// web/app/(site)/(session)/@runtime/exegesis/[displayId]/page.tsx
import React from "react";
import SessionRuntime from "../../SessionRuntime";

export const revalidate = 0;

export default async function PortalExegesisTrackRuntimePage(props: {
  params: Promise<{ displayId: string }>;
}) {
  const { displayId } = await props.params;

  // Decode once, here, on the server — so the client doesn’t “discover” it later.
  const raw = decodeURIComponent(displayId ?? "").trim();
  const resolvedDisplayId = raw || displayId;

  return (
    <SessionRuntime
      albumSlugOverride={null}
      initialPortalTabId="exegesis"
      initialExegesisDisplayId={resolvedDisplayId}
    />
  );
}
