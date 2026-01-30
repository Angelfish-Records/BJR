// web/app/api/admin/share-tokens/mint/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";
import { ENTITLEMENTS } from "@/lib/vocab";
import { checkAccess } from "@/lib/access";
import { createShareToken, type TokenGrant } from "@/lib/shareTokens";

type Body = {
  albumId: string;
  expiresAt?: string | null; // ISO
  maxRedemptions?: number | null;
  note?: string | null;
};

function isBody(x: unknown): x is Body {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.albumId !== "string") return false;
  if (o.expiresAt != null && typeof o.expiresAt !== "string") return false;
  if (o.maxRedemptions != null && typeof o.maxRedemptions !== "number")
    return false;
  if (o.note != null && typeof o.note !== "string") return false;
  return true;
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function parseExpiresAt(expiresAt: string | null | undefined): string | null {
  const s = cleanStr(expiresAt);
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t))
    throw new Error("expiresAt must be an ISO date string");
  return new Date(t).toISOString();
}

async function getMemberIdByClerkUserId(
  userId: string,
): Promise<string | null> {
  if (!userId) return null;
  const r = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  return (r.rows?.[0]?.id as string | undefined) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "AUTH_REQUIRED" },
        { status: 401 },
      );
    }

    const memberId = await getMemberIdByClerkUserId(userId);
    if (!memberId) {
      return NextResponse.json(
        { ok: false, error: "PROVISIONING" },
        { status: 403 },
      );
    }

    const adminDecision = await checkAccess(
      memberId,
      { kind: "global", required: [ENTITLEMENTS.ADMIN] },
      { log: false, action: "admin_mint_share_token" },
    );
    if (!adminDecision.allowed) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403 },
      );
    }

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

    const expiresAt = parseExpiresAt(raw.expiresAt);
    const note = cleanStr(raw.note);

    const canonicalAlbumId = albumId.startsWith("alb:")
      ? albumId.slice(4)
      : albumId;
    const scopeId = `alb:${canonicalAlbumId}`;

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
      expiresAt,
      maxRedemptions,
      createdByMemberId: memberId,
    });

    return NextResponse.json({ ok: true, ...created });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
