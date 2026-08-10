import { NextResponse } from "next/server";
import { requireAdminMemberId } from "@/lib/adminAuth";
import { searchRecordingsForAdmin } from "@/lib/albums";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asLimit(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.min(25, Math.floor(value)));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(25, Math.floor(parsed)));
    }
  }

  return undefined;
}

function getErrorStatus(message: string): number {
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 400;
}

export async function GET(request: Request) {
  try {
    await requireAdminMemberId();

    const { searchParams } = new URL(request.url);
    const query = asString(searchParams.get("q"));
    const limit = asLimit(searchParams.get("limit"));

    if (!query) {
      return NextResponse.json({
        ok: true,
        query: "",
        results: [],
      });
    }

    const results = await searchRecordingsForAdmin({
      query,
      limit,
    });

    return NextResponse.json({
      ok: true,
      query,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to search recordings.";

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