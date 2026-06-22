// web/app/api/admin/share-tokens/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { requireAdminMemberId } from "@/lib/adminAuth";
import { ENTITLEMENTS } from "@/lib/vocab";
import { createShareToken, type TokenGrant } from "@/lib/shareTokens";

type Body = {
  albumId: string;
  expiresAt?: string | null; // ISO
  maxRedemptions?: number | null;
  note?: string | null;
  telemetryLabel?: string | null;
};

function isBody(x: unknown): x is Body {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.albumId !== "string") return false;
  if (o.expiresAt != null && typeof o.expiresAt !== "string") return false;
  if (o.maxRedemptions != null && typeof o.maxRedemptions !== "number")
    return false;
  if (o.note != null && typeof o.note !== "string") return false;
  if (o.telemetryLabel != null && typeof o.telemetryLabel !== "string") {
    return false;
  }
  return true;
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function parseExpiresAt(expiresAt: string | null | undefined):
  | {
      ok: true;
      value: string | null;
    }
  | {
      ok: false;
      error: string;
    } {
  const s = cleanStr(expiresAt);
  if (!s) return { ok: true, value: null };

  const t = Date.parse(s);
  if (!Number.isFinite(t)) {
    return { ok: false, error: "expiresAt must be an ISO date string" };
  }

  return { ok: true, value: new Date(t).toISOString() };
}

export async function POST(req: Request) {
  try {
    const adminMemberId = await requireAdminMemberId();

    const raw: unknown = await req.json().catch(() => null);
    if (!isBody(raw)) {
      return NextResponse.json(
        { ok: false, error: "Bad request" },
        { status: 400 },
      );
    }

    const albumId = (raw.albumId ?? "").trim();
    if (!albumId) {
      return NextResponse.json(
        { ok: false, error: "albumId is required" },
        { status: 400 },
      );
    }

    const maxRedemptions =
      raw.maxRedemptions == null
        ? null
        : Math.max(1, Math.floor(raw.maxRedemptions));

    const expiresResult = parseExpiresAt(raw.expiresAt);
    if (!expiresResult.ok) {
      return NextResponse.json(
        { ok: false, error: expiresResult.error },
        { status: 400 },
      );
    }

    const expiresIso = expiresResult.value;
    const scopeId = `alb:${albumId}`;

    const note = cleanStr(raw.note);
    const telemetryLabel = cleanStr(raw.telemetryLabel);

    if (!telemetryLabel) {
      return NextResponse.json(
        { ok: false, error: "telemetryLabel is required" },
        { status: 400 },
      );
    }

    if (telemetryLabel.length > 120) {
      return NextResponse.json(
        {
          ok: false,
          error: "telemetryLabel must be 120 characters or fewer",
        },
        { status: 400 },
      );
    }

    const grants: TokenGrant[] = [
      {
        key: ENTITLEMENTS.PLAY_ALBUM,
        scopeId,
        ...(note ? { scopeMeta: { note } } : {}),
      },
    ];

    const created = await createShareToken({
      kind: "album_press",
      scopeId,
      grants,
      expiresAt: expiresIso,
      maxRedemptions,
      telemetryLabel,
      createdByMemberId: adminMemberId,
    });

    return NextResponse.json({
      ok: true,
      token: created.token,
      tokenId: created.tokenId,
      kind: created.kind,
      scopeId: created.scopeId,
      expiresAt: created.expiresAt,
      maxRedemptions: created.maxRedemptions,
      telemetryLabel: created.telemetryLabel,
      createdAt: created.createdAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}
