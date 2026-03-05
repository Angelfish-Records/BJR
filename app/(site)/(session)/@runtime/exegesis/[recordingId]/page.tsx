// web/app/(site)/(session)/@runtime/exegesis/[recordingId]/page.tsx
import React from "react";
import SessionRuntime from "../../SessionRuntime";

export const dynamic = "auto";
export const revalidate = 0;

export default async function PortalExegesisTrackRuntimePage(props: {
  params: Promise<{ recordingId: string }>;
}) {
  const { recordingId } = await props.params;

  // Decode once, here, on the server — so the client doesn’t “discover” it later.
  const raw = decodeURIComponent(recordingId ?? "").trim();
  const resolvedRecordingId = raw || recordingId;

  return (
    <SessionRuntime
      albumSlugOverride={null}
      initialPortalTabId="exegesis"
      initialExegesisRecordingId={resolvedRecordingId}
    />
  );
}