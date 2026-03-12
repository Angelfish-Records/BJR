import type { BadgeQualificationMode } from "@/lib/badgePreviewModes";

export type BadgeDefinitionOption = {
  entitlementKey: string;
  title: string;
  description: string | null;
  displayOrder: number;
  imageUrl: string | null;
  featured: boolean;
  shareable: boolean;
  undisclosed: boolean;
};

export type PreviewRow = {
  memberId: string;
  email: string | null;
  joinedAt: string | null;
  listenedMs: number | null;
  minutesStreamed: number | null;
  playCount: number | null;
  completedCount: number | null;
  matchedRecordingId: string | null;
  matchedRecordingTitle: string | null;
  matchedWindowEventCount: number | null;
  contributionCount: number | null;
  exegesisVoteCount: number | null;
  publicNameUnlockedAt: string | null;
};

export type PreviewResponse = {
  ok: boolean;
  count?: number;
  rows?: PreviewRow[];
  error?: string;
};

export type AwardResponse = {
  ok: boolean;
  result?: {
    entitlementKey: string;
    attempted: number;
    inserted: number;
    alreadyHeld: number;
  };
  summary?: {
    attempted: number;
    inserted: number;
    alreadyHeld: number;
    hasNewGrants: boolean;
  };
  error?: string;
};

export type Props = {
  embed: boolean;
  badgeDefinitions: BadgeDefinitionOption[];
};

export type RecordingSearchResult = {
  recordingId: string;
  title: string;
  artist?: string | null;
  albumSlug?: string | null;
  albumTitle?: string | null;
};

export type RecordingSearchResponse = {
  ok: boolean;
  results?: RecordingSearchResult[];
  error?: string;
};

export type FormState = {
  entitlementKey: string;
  mode: BadgeQualificationMode;
  minMinutes: string;
  minPlayCount: string;
  minCompletedCount: string;
  minProgressCount: string;
  minContributionCount: string;
  minVoteCount: string;
  joinedOnOrAfter: string;
  joinedBefore: string;
  activeOnOrAfter: string;
  activeBefore: string;
  recordingId: string;
  limit: string;
  grantReason: string;
};

export type SelectedModeInputRequirements = {
  minMinutes: boolean;
  minPlayCount: boolean;
  minCompletedCount: boolean;
  minProgressCount: boolean;
  minContributionCount: boolean;
  minVoteCount: boolean;
  joinedWindow: boolean;
  activeWindow: boolean;
  recordingId: boolean;
};

export type SelectedModeFieldText = {
  minMinutesLabel: string;
  minMinutesHelp: string | null;
  minPlayCountLabel: string;
  minPlayCountHelp: string | null;
  minCompletedCountLabel: string;
  minCompletedCountHelp: string | null;
  minProgressCountLabel: string;
  minProgressCountHelp: string | null;
  minContributionCountLabel: string;
  minContributionCountHelp: string | null;
  minVoteCountLabel: string;
  minVoteCountHelp: string | null;
  joinedOnOrAfterLabel: string;
  joinedBeforeLabel: string;
  joinedWindowHelp: string | null;
  activeOnOrAfterLabel: string;
  activeBeforeLabel: string;
  activeWindowHelp: string | null;
  recordingIdLabel: string;
  recordingIdPlaceholder: string;
  recordingIdHelp: string | null;
};
