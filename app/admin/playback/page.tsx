// web/app/admin/playback/page.tsx
import "server-only";

import PlaybackTelemetryDashboardClient from "./PlaybackTelemetryDashboardClient";
import { getPlaybackAdminSnapshot } from "@/lib/playbackAdmin";

export default async function Page(
  props: Readonly<{
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }>,
) {
  const sp = (await props.searchParams) ?? {};
  const embed = typeof sp.embed === "string" && sp.embed === "1";

  const snapshot = await getPlaybackAdminSnapshot();

  return (
    <PlaybackTelemetryDashboardClient
      embed={embed}
      initialSnapshot={snapshot}
    />
  );
}