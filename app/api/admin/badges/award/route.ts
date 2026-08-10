// web/app/api/admin/badges/award/route.ts
import { NextResponse } from "next/server";
import { requireAdminMemberId } from "@/lib/adminAuth";
import { awardBadgeToMembers } from "@/lib/badgeAdmin";
import { areBadgesEnabled } from "@/lib/badgeFeature";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const rows: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    rows.push(trimmed);
  }

  return rows;
}

function getErrorStatus(message: string): number {
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 400;
}

export async function POST(request: Request) {
  try {
    const adminMemberId = await requireAdminMemberId();

    if (!areBadgesEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Badges are currently disabled.",
          code: "BADGES_DISABLED",
        },
        { status: 409 },
      );
    }

    const body = (await request.json()) as unknown;
    if (!isRecord(body)) {
      throw new Error("Invalid request body.");
    }

    const entitlementKey = asString(body.entitlementKey);
    if (!entitlementKey) {
      throw new Error("entitlementKey is required.");
    }

    if (!entitlementKey.startsWith("badge_")) {
      throw new Error("entitlementKey must start with badge_.");
    }

    const memberIds = asStringArray(body.memberIds);
    if (memberIds.length === 0) {
      throw new Error("At least one memberId is required.");
    }

    const grantReason = asString(body.grantReason);
    const grantSource = asString(body.grantSource) ?? "badge_admin_preview";
    const grantSourceRef = asString(body.grantSourceRef);

    const result = await awardBadgeToMembers({
      entitlementKey,
      memberIds,
      grantedBy: adminMemberId,
      grantReason: grantReason ?? undefined,
      grantSource,
      grantSourceRef: grantSourceRef ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      result,
      summary: {
        attempted: result.attempted,
        inserted: result.inserted,
        alreadyHeld: result.alreadyHeld,
        hasNewGrants: result.inserted > 0,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to award badge.";

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
