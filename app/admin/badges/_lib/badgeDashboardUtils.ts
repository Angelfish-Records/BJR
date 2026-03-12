import type { FormState } from "./badgeDashboardTypes";

export const DEFAULT_FORM_STATE: FormState = {
  entitlementKey: "",
  mode: "minutes_streamed",
  minMinutes: "500",
  minPlayCount: "10",
  minCompletedCount: "3",
  minProgressCount: "1",
  minContributionCount: "10",
  minVoteCount: "10",
  joinedOnOrAfter: "",
  joinedBefore: "",
  activeOnOrAfter: "",
  activeBefore: "",
  recordingId: "",
  limit: "200",
  grantReason: "",
};

export function formatDateTime(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

export function formatMetric(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString();
}

export function getBadgeCardBorder(
  isSelected: boolean,
  isFeatured: boolean,
): string {
  if (isSelected) return "1px solid rgba(255,255,255,0.32)";
  if (isFeatured) return "1px solid rgba(255,255,255,0.18)";
  return "1px solid rgba(255,255,255,0.1)";
}

export function buildPreviewPayload(
  form: FormState,
): Record<string, string | number> {
  const limit = form.limit.trim() ? Number(form.limit) : 200;

  switch (form.mode) {
    case "minutes_streamed":
      return {
        mode: form.mode,
        minMinutes: Number(form.minMinutes || "0"),
        limit,
      };

    case "play_count":
      return {
        mode: form.mode,
        minPlayCount: Number(form.minPlayCount || "0"),
        limit,
      };

    case "complete_count":
      return {
        mode: form.mode,
        minCompletedCount: Number(form.minCompletedCount || "0"),
        limit,
      };

    case "joined_within_window": {
      const payload: Record<string, string | number> = {
        mode: form.mode,
        joinedOnOrAfter: form.joinedOnOrAfter,
        limit,
      };

      if (form.joinedBefore.trim()) {
        payload.joinedBefore = form.joinedBefore.trim();
      }

      return payload;
    }

    case "active_within_window": {
      const payload: Record<string, string | number> = {
        mode: form.mode,
        activeOnOrAfter: form.activeOnOrAfter,
        minPlayCount: Number(form.minPlayCount || "0"),
        minProgressCount: Number(form.minProgressCount || "0"),
        minCompleteCount: Number(form.minCompletedCount || "0"),
        limit,
      };

      if (form.activeBefore.trim()) {
        payload.activeBefore = form.activeBefore.trim();
      }

      return payload;
    }

    case "recording_minutes_streamed":
      return {
        mode: form.mode,
        recordingId: form.recordingId,
        minMinutes: Number(form.minMinutes || "0"),
        limit,
      };

    case "recording_play_count":
      return {
        mode: form.mode,
        recordingId: form.recordingId,
        minPlayCount: Number(form.minPlayCount || "0"),
        limit,
      };

    case "recording_complete_count":
      return {
        mode: form.mode,
        recordingId: form.recordingId,
        minCompletedCount: Number(form.minCompletedCount || "0"),
        limit,
      };

    case "exegesis_contribution_count":
      return {
        mode: form.mode,
        minContributionCount: Number(form.minContributionCount || "0"),
        limit,
      };

    case "exegesis_vote_tally":
      return {
        mode: form.mode,
        minVoteCount: Number(form.minVoteCount || "0"),
        limit,
      };

    case "public_name_unlocked":
      return {
        mode: form.mode,
        limit,
      };
  }
}
