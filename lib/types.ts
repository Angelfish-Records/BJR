// web/lib/types.ts

export type TierName = "friend" | "patron" | "partner";
export type Tier = "none" | TierName;

export type AlbumEmbargoInfo = {
  embargoed: boolean;
  releaseAt: string | null;
  note?: string | null;
};

export type AlbumInfo = {
  id: string;
  catalogId?: string;
  title: string;
  artist?: string;
  year?: number;
  description?: string;
  artworkUrl?: string | null;
  policy?: AlbumPolicy;
  embargo?: AlbumEmbargoInfo;
};

export type AlbumPolicy = {
  publicPageVisible: boolean;
  releaseAt?: string | null;
  earlyAccessEnabled?: boolean;
  earlyAccessTiers?: TierName[];
  minTierToLoad?: TierName | null;
};

export type AlbumNavItem = {
  id: string;
  slug: string;
  title: string;
  artist?: string;
  year?: number;
  coverUrl?: string | null;

  // browse-click gating (load gate)
  policy?: {
    publicPageVisible: boolean;
    minTierToLoad: TierName | null;
  };
};

export type PlayerTrack = {
  id: string;
  catalogId: string | null;
  title?: string;
  artist?: string;
  durationMs?: number;
  muxPlaybackId?: string;
  visualTheme?: string;
};
