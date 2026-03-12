// web/lib/badgePreviewModes.ts
export type BadgeQualificationMode =
  | "minutes_streamed"
  | "play_count"
  | "complete_count"
  | "joined_within_window"
  | "active_within_window"
  | "recording_minutes_streamed"
  | "recording_play_count"
  | "recording_complete_count"
  | "exegesis_contribution_count"
  | "exegesis_vote_tally"
  | "public_name_unlocked";

export type BadgePreviewModeDescriptor = {
  key: BadgeQualificationMode;
  label: string;
  description: string;
  requiresRecording: boolean;
  supportsDateWindow: boolean;
  metricFamily:
    | "minutes"
    | "plays"
    | "completes"
    | "membership"
    | "activity"
    | "exegesis"
    | "identity";
  inputRequirements: {
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
  fieldText: {
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
};

export const BADGE_PREVIEW_MODE_DESCRIPTORS: Record<
  BadgeQualificationMode,
  BadgePreviewModeDescriptor
> = {
  minutes_streamed: {
    key: "minutes_streamed",
    label: "Total minutes streamed",
    description: "Qualify members by all-time listening minutes.",
    requiresRecording: false,
    supportsDateWindow: false,
    metricFamily: "minutes",
    inputRequirements: {
      minMinutes: true,
      minPlayCount: false,
      minCompletedCount: false,
      minProgressCount: false,
      minContributionCount: false,
      minVoteCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp:
        "Qualify members whose all-time listening minutes meet or exceed this threshold.",
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      minContributionCountLabel: "Minimum Exegesis contributions",
      minContributionCountHelp: null,
      minVoteCountLabel: "Minimum cumulative vote tally",
      minVoteCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  play_count: {
    key: "play_count",
    label: "Total play count",
    description: "Qualify members by all-time credited play count.",
    requiresRecording: false,
    supportsDateWindow: false,
    metricFamily: "plays",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: true,
      minCompletedCount: false,
      minProgressCount: false,
      minContributionCount: false,
      minVoteCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp:
        "Qualify members whose all-time credited plays meet or exceed this threshold.",
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      minContributionCountLabel: "Minimum Exegesis contributions",
      minContributionCountHelp: null,
      minVoteCountLabel: "Minimum cumulative vote tally",
      minVoteCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  complete_count: {
    key: "complete_count",
    label: "Total complete count",
    description: "Qualify members by all-time completion count.",
    requiresRecording: false,
    supportsDateWindow: false,
    metricFamily: "completes",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: false,
      minCompletedCount: true,
      minProgressCount: false,
      minContributionCount: false,
      minVoteCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp:
        "Qualify members whose all-time completion count meets or exceeds this threshold.",
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      minContributionCountLabel: "Minimum Exegesis contributions",
      minContributionCountHelp: null,
      minVoteCountLabel: "Minimum cumulative vote tally",
      minVoteCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  joined_within_window: {
    key: "joined_within_window",
    label: "Joined within date window",
    description: "Qualify members by membership creation time.",
    requiresRecording: false,
    supportsDateWindow: true,
    metricFamily: "membership",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: false,
      minCompletedCount: false,
      minProgressCount: false,
      minContributionCount: false,
      minVoteCount: false,
      joinedWindow: true,
      activeWindow: false,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      minContributionCountLabel: "Minimum Exegesis contributions",
      minContributionCountHelp: null,
      minVoteCountLabel: "Minimum cumulative vote tally",
      minVoteCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp:
        "Qualify members whose account creation timestamp falls within this date window.",
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  active_within_window: {
    key: "active_within_window",
    label: "Active within playback window",
    description:
      "Qualify members by member telemetry activity inside a time window.",
    requiresRecording: false,
    supportsDateWindow: true,
    metricFamily: "activity",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: true,
      minCompletedCount: true,
      minProgressCount: true,
      minContributionCount: false,
      minVoteCount: false,
      joinedWindow: false,
      activeWindow: true,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count in window",
      minPlayCountHelp:
        "Count qualifying play events within the selected playback window.",
      minCompletedCountLabel: "Minimum complete count in window",
      minCompletedCountHelp:
        "Count qualifying completion events within the selected playback window.",
      minProgressCountLabel: "Minimum progress count in window",
      minProgressCountHelp:
        "Progress count reflects credited telemetry progress events, not literal minutes.",
      minContributionCountLabel: "Minimum Exegesis contributions",
      minContributionCountHelp: null,
      minVoteCountLabel: "Minimum cumulative vote tally",
      minVoteCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp:
        "Qualify members whose telemetry activity falls within this playback time window.",
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  recording_minutes_streamed: {
    key: "recording_minutes_streamed",
    label: "Recording-specific minutes streamed",
    description: "Qualify members by minutes streamed on a specific recording.",
    requiresRecording: true,
    supportsDateWindow: false,
    metricFamily: "minutes",
    inputRequirements: {
      minMinutes: true,
      minPlayCount: false,
      minCompletedCount: false,
      minProgressCount: false,
      minContributionCount: false,
      minVoteCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: true,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed on recording",
      minMinutesHelp:
        "Qualify members whose listening minutes on the selected recording meet or exceed this threshold.",
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      minContributionCountLabel: "Minimum Exegesis contributions",
      minContributionCountHelp: null,
      minVoteCountLabel: "Minimum cumulative vote tally",
      minVoteCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp:
        "Use the canonical recording UUID for the work being qualified.",
    },
  },
  recording_play_count: {
    key: "recording_play_count",
    label: "Recording-specific play count",
    description: "Qualify members by play count on a specific recording.",
    requiresRecording: true,
    supportsDateWindow: false,
    metricFamily: "plays",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: true,
      minCompletedCount: false,
      minProgressCount: false,
      minContributionCount: false,
      minVoteCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: true,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count on recording",
      minPlayCountHelp:
        "Qualify members whose credited plays on the selected recording meet or exceed this threshold.",
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      minContributionCountLabel: "Minimum Exegesis contributions",
      minContributionCountHelp: null,
      minVoteCountLabel: "Minimum cumulative vote tally",
      minVoteCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp:
        "Use the canonical recording UUID for the work being qualified.",
    },
  },
  recording_complete_count: {
    key: "recording_complete_count",
    label: "Recording-specific complete count",
    description: "Qualify members by completion count on a specific recording.",
    requiresRecording: true,
    supportsDateWindow: false,
    metricFamily: "completes",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: false,
      minCompletedCount: true,
      minProgressCount: false,
      minContributionCount: false,
      minVoteCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: true,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count on recording",
      minCompletedCountHelp:
        "Qualify members whose completion count on the selected recording meets or exceeds this threshold.",
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      minContributionCountLabel: "Minimum Exegesis contributions",
      minContributionCountHelp: null,
      minVoteCountLabel: "Minimum cumulative vote tally",
      minVoteCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp:
        "Use the canonical recording UUID for the work being qualified.",
    },
  },
  exegesis_contribution_count: {
    key: "exegesis_contribution_count",
    label: "Exegesis contribution count",
    description:
      "Qualify members by their cumulative Exegesis contribution count.",
    requiresRecording: false,
    supportsDateWindow: false,
    metricFamily: "exegesis",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: false,
      minCompletedCount: false,
      minProgressCount: false,
      minContributionCount: true,
      minVoteCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      minContributionCountLabel: "Minimum Exegesis contributions",
      minContributionCountHelp:
        "Qualify members whose total Exegesis contribution count meets or exceeds this threshold.",
      minVoteCountLabel: "Minimum cumulative vote tally",
      minVoteCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  exegesis_vote_tally: {
    key: "exegesis_vote_tally",
    label: "Exegesis cumulative vote tally",
    description:
      "Qualify members by the cumulative votes received across their Exegesis contributions.",
    requiresRecording: false,
    supportsDateWindow: false,
    metricFamily: "exegesis",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: false,
      minCompletedCount: false,
      minProgressCount: false,
      minContributionCount: false,
      minVoteCount: true,
      joinedWindow: false,
      activeWindow: false,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      minContributionCountLabel: "Minimum Exegesis contributions",
      minContributionCountHelp: null,
      minVoteCountLabel: "Minimum cumulative vote tally",
      minVoteCountHelp:
        "Qualify members whose total votes received across live Exegesis comments meet or exceed this threshold.",
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  public_name_unlocked: {
    key: "public_name_unlocked",
    label: "Public name unlocked",
    description:
      "Qualify members whose public-name unlock state has been reached through Exegesis.",
    requiresRecording: false,
    supportsDateWindow: false,
    metricFamily: "identity",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: false,
      minCompletedCount: false,
      minProgressCount: false,
      minContributionCount: false,
      minVoteCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      minContributionCountLabel: "Minimum Exegesis contributions",
      minContributionCountHelp: null,
      minVoteCountLabel: "Minimum cumulative vote tally",
      minVoteCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
};

export const BADGE_PREVIEW_MODES: BadgePreviewModeDescriptor[] = [
  BADGE_PREVIEW_MODE_DESCRIPTORS.minutes_streamed,
  BADGE_PREVIEW_MODE_DESCRIPTORS.play_count,
  BADGE_PREVIEW_MODE_DESCRIPTORS.complete_count,
  BADGE_PREVIEW_MODE_DESCRIPTORS.joined_within_window,
  BADGE_PREVIEW_MODE_DESCRIPTORS.active_within_window,
  BADGE_PREVIEW_MODE_DESCRIPTORS.recording_minutes_streamed,
  BADGE_PREVIEW_MODE_DESCRIPTORS.recording_play_count,
  BADGE_PREVIEW_MODE_DESCRIPTORS.recording_complete_count,
  BADGE_PREVIEW_MODE_DESCRIPTORS.exegesis_contribution_count,
  BADGE_PREVIEW_MODE_DESCRIPTORS.exegesis_vote_tally,
  BADGE_PREVIEW_MODE_DESCRIPTORS.public_name_unlocked,
];

export function getBadgePreviewModeDescriptor(
  mode: BadgeQualificationMode,
): BadgePreviewModeDescriptor {
  return BADGE_PREVIEW_MODE_DESCRIPTORS[mode];
}

export function isRecordingScopedBadgePreviewMode(
  mode: BadgeQualificationMode,
): boolean {
  return BADGE_PREVIEW_MODE_DESCRIPTORS[mode].requiresRecording;
}
