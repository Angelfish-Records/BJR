import type { ResolvedDisplayIdentity } from "@/lib/memberIdentity";

export type MemberDashboardBadge = {
  key: string;
  label: string;
  description?: string | null;
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
  contributionCount: number | null;
  minutesStreamed: number | null;
  favouriteTrack: PortalMemberFavouriteTrack | null;
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