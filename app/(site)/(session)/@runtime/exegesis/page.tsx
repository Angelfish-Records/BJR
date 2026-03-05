// web/app/(site)/(session)/@runtime/exegesis/page.tsx
import React from "react";
import SessionRuntime from "../SessionRuntime";

// Let SessionRuntime decide whether it must be dynamic.
// (We can re-introduce force-dynamic later if required.)
export const dynamic = "auto";
export const revalidate = 0;

export default async function PortalExegesisIndexRuntimePage() {
  return (
    <SessionRuntime
      albumSlugOverride={null}
      initialPortalTabId="exegesis"
      initialExegesisrecordingId={null}
    />
  );
}