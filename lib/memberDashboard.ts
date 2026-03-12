// web/lib/memberDashboard.ts
import type { ResolvedDisplayIdentity } from "@/lib/memberIdentity";

export type MemberDashboardBadge = {
  key: string;
  label: string;
  description?: string | null;
  imageUrl?: string | null;
  shareable?: boolean;
  undisclosed?: boolean;
  unlocked: boolean;
  unlockedAt?: string | null;
};

export type PortalMemberFavouriteTrack = {
  recordingId: string;
  title: string;
  artist?: string | null;
  minutes?: number | null;
};

export type PortalMemberSummary = {
  identity: ResolvedDisplayIdentity | null;

  /**
   * All-time member signal.
   *
   * Transitional semantic:
   * currently sourced from Exegesis contributions only.
   *
   * The field name remains broader so it can later widen into a
   * cross-surface participation aggregate without changing the
   * member-panel contract.
   */
  contributionCount: number | null;

  /**
   * All-time listening minutes once playback telemetry exists.
   */
  minutesStreamed: number | null;

  /**
   * All-time statistically inferred listening preference.
   */
  favouriteTrack: PortalMemberFavouriteTrack | null;

  /**
   * Unified badge cabinet projection.
   * Ordered badge definitions are merged with member possession state.
   */
  badges: MemberDashboardBadge[];
};

export function emptyPortalMemberSummary(): PortalMemberSummary {
  return {
    identity: null,
    contributionCount: null,
    minutesStreamed: null,
    favouriteTrack: null,
    badges: [],
  };
}
