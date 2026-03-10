// web/app/(site)/(session)/@runtime/[tab]/page.tsx
import React from "react";
import SessionRuntime from "../SessionRuntime";

export const dynamic = "auto";

export default async function PortalRuntimePage() {
  // Important: for portal routes we *still* want an album context to exist
  // (queue priming, stage, etc). We use featured album fallback via SessionRuntime.
  return <SessionRuntime albumSlugOverride={null} />;
}
