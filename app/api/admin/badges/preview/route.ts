// web/app/api/admin/badges/preview/route.ts
import { NextResponse } from "next/server";
import { requireAdminMemberId } from "@/lib/adminAuth";
import {
  BADGE_PREVIEW_MODE_DESCRIPTORS,
  previewBadgeQualification,
  type BadgePreviewInput,
  type BadgeQualificationMode,
} from "@/lib/badgeAdmin";

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
    case "minutes_streamed": {
      const minMinutes = asPositiveNumber(body.minMinutes);
      if (minMinutes === null) {
        throw new Error("minMinutes is required.");
      }

      return {
        mode,
        minMinutes,
        limit,
      };
    }

    case "play_count": {
      const minPlayCount = asPositiveNumber(body.minPlayCount);
      if (minPlayCount === null) {
        throw new Error("minPlayCount is required.");
      }

      return {
        mode,
        minPlayCount,
        limit,
      };
    }

    case "complete_count": {
      const minCompletedCount = asPositiveNumber(body.minCompletedCount);
      if (minCompletedCount === null) {
        throw new Error("minCompletedCount is required.");
      }

      return {
        mode,
        minCompletedCount,
        limit,
      };
    }

    case "joined_within_window": {
      const joinedOnOrAfter = asString(body.joinedOnOrAfter);
      if (!joinedOnOrAfter) {
        throw new Error("joinedOnOrAfter is required.");
      }

      return {
        mode,
        joinedOnOrAfter,
        joinedBefore: asOptionalString(body.joinedBefore),
        limit,
      };
    }

    case "active_within_window": {
      const activeOnOrAfter = asString(body.activeOnOrAfter);
      if (!activeOnOrAfter) {
        throw new Error("activeOnOrAfter is required.");
      }

      return {
        mode,
        activeOnOrAfter,
        activeBefore: asOptionalString(body.activeBefore),
        minPlayCount: asPositiveNumber(body.minPlayCount) ?? 0,
        minProgressCount: asPositiveNumber(body.minProgressCount) ?? 0,
        minCompleteCount: asPositiveNumber(body.minCompleteCount) ?? 0,
        limit,
      };
    }

    case "recording_minutes_streamed": {
      const recordingId = asString(body.recordingId);
      const minMinutes = asPositiveNumber(body.minMinutes);

      if (!recordingId) {
        throw new Error("recordingId is required.");
      }
      if (minMinutes === null) {
        throw new Error("minMinutes is required.");
      }

      return {
        mode,
        recordingId,
        minMinutes,
        limit,
      };
    }

    case "recording_play_count": {
      const recordingId = asString(body.recordingId);
      const minPlayCount = asPositiveNumber(body.minPlayCount);

      if (!recordingId) {
        throw new Error("recordingId is required.");
      }
      if (minPlayCount === null) {
        throw new Error("minPlayCount is required.");
      }

      return {
        mode,
        recordingId,
        minPlayCount,
        limit,
      };
    }

    case "recording_complete_count": {
      const recordingId = asString(body.recordingId);
      const minCompletedCount = asPositiveNumber(body.minCompletedCount);

      if (!recordingId) {
        throw new Error("recordingId is required.");
      }
      if (minCompletedCount === null) {
        throw new Error("minCompletedCount is required.");
      }

      return {
        mode,
        recordingId,
        minCompletedCount,
        limit,
      };
    }

    default: {
      const exhaustiveCheck: never = mode;
      throw new Error(
        `Unhandled badge preview mode: ${String(exhaustiveCheck)}`,
      );
    }
  }
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

    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status },
    );
  }
}
