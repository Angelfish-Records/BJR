// web/app/api/admin/badges/preview/route.ts
import { NextResponse } from "next/server";
import { requireAdminMemberId } from "@/lib/adminAuth";
import {
  previewBadgeQualification,
  type BadgePreviewInput,
} from "@/lib/badgeAdmin";
import {
  BADGE_PREVIEW_MODE_DESCRIPTORS,
  type BadgeQualificationMode,
} from "@/lib/badgePreviewModes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return asString(value);
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  return null;
}

function asOptionalLimit(value: unknown): number | undefined {
  const parsed = asPositiveNumber(value);
  return parsed === null ? undefined : Math.floor(parsed);
}

function isBadgeQualificationMode(
  value: string,
): value is BadgeQualificationMode {
  return value in BADGE_PREVIEW_MODE_DESCRIPTORS;
}

function requireStringField(
  body: Record<string, unknown>,
  key: string,
  errorMessage: string,
): string {
  const value = asString(body[key]);
  if (!value) throw new Error(errorMessage);
  return value;
}

function requirePositiveNumberField(
  body: Record<string, unknown>,
  key: string,
  errorMessage: string,
): number {
  const value = asPositiveNumber(body[key]);
  if (value === null) throw new Error(errorMessage);
  return value;
}

function parsePreviewInput(body: unknown): BadgePreviewInput {
  if (!isRecord(body)) {
    throw new Error("Invalid request body.");
  }

  const mode = asString(body.mode);
  if (!mode) {
    throw new Error("Mode is required.");
  }

  if (!isBadgeQualificationMode(mode)) {
    throw new Error("Unsupported badge preview mode.");
  }

  const limit = asOptionalLimit(body.limit);

  switch (mode) {
    case "minutes_streamed":
      return {
        mode,
        minMinutes: requirePositiveNumberField(
          body,
          "minMinutes",
          "minMinutes is required.",
        ),
        limit,
      };

    case "play_count":
      return {
        mode,
        minPlayCount: requirePositiveNumberField(
          body,
          "minPlayCount",
          "minPlayCount is required.",
        ),
        limit,
      };

    case "complete_count":
      return {
        mode,
        minCompletedCount: requirePositiveNumberField(
          body,
          "minCompletedCount",
          "minCompletedCount is required.",
        ),
        limit,
      };

    case "joined_within_window":
      return {
        mode,
        joinedOnOrAfter: requireStringField(
          body,
          "joinedOnOrAfter",
          "joinedOnOrAfter is required.",
        ),
        joinedBefore: asOptionalString(body.joinedBefore),
        limit,
      };

    case "active_within_window":
      return {
        mode,
        activeOnOrAfter: requireStringField(
          body,
          "activeOnOrAfter",
          "activeOnOrAfter is required.",
        ),
        activeBefore: asOptionalString(body.activeBefore),
        minPlayCount: asPositiveNumber(body.minPlayCount) ?? 0,
        minProgressCount: asPositiveNumber(body.minProgressCount) ?? 0,
        minCompleteCount: asPositiveNumber(body.minCompleteCount) ?? 0,
        limit,
      };

    case "recording_minutes_streamed":
      return {
        mode,
        recordingId: requireStringField(
          body,
          "recordingId",
          "recordingId is required.",
        ),
        minMinutes: requirePositiveNumberField(
          body,
          "minMinutes",
          "minMinutes is required.",
        ),
        limit,
      };

    case "recording_play_count":
      return {
        mode,
        recordingId: requireStringField(
          body,
          "recordingId",
          "recordingId is required.",
        ),
        minPlayCount: requirePositiveNumberField(
          body,
          "minPlayCount",
          "minPlayCount is required.",
        ),
        limit,
      };

    case "recording_complete_count":
      return {
        mode,
        recordingId: requireStringField(
          body,
          "recordingId",
          "recordingId is required.",
        ),
        minCompletedCount: requirePositiveNumberField(
          body,
          "minCompletedCount",
          "minCompletedCount is required.",
        ),
        limit,
      };

    case "exegesis_contribution_count":
      return {
        mode,
        minContributionCount: requirePositiveNumberField(
          body,
          "minContributionCount",
          "minContributionCount is required.",
        ),
        limit,
      };

    case "exegesis_vote_tally":
      return {
        mode,
        minVoteCount: requirePositiveNumberField(
          body,
          "minVoteCount",
          "minVoteCount is required.",
        ),
        limit,
      };

    case "public_name_unlocked":
      return {
        mode,
        limit,
      };

    default: {
      const exhaustiveCheck: never = mode;
      throw new Error(
        `Unhandled badge preview mode: ${String(exhaustiveCheck)}`,
      );
    }
  }
}

function getErrorStatus(message: string): number {
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 400;
}

export async function POST(request: Request) {
  try {
    await requireAdminMemberId();

    const body = (await request.json()) as unknown;
    const input = parsePreviewInput(body);
    const rows = await previewBadgeQualification(input);

    return NextResponse.json({
      ok: true,
      count: rows.length,
      rows,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to preview badge cohort.";

    const status = getErrorStatus(message);

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status },
    );
  }
}
