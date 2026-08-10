// web/app/(site)/(session)/@runtime/exegesis/[displayId]/page.tsx
import React from "react";
import SessionRuntime from "../../SessionRuntime";

export default async function PortalExegesisTrackRuntimePage(
  props: Readonly<{
    params: Promise<{ displayId: string }>;
  }>,
) {
  const { displayId } = await props.params;
  const resolvedDisplayId = decodeURIComponent(displayId ?? "").trim() || null;

  return (
    <SessionRuntime
      albumSlugOverride={null}
      initialPortalTabId="exegesis"
      initialExegesisDisplayId={resolvedDisplayId}
    />
  );
}
