import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAdminMemberId } from "@/lib/adminAuth";

function must(v: string | undefined, name: string): string {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function safeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function extFromType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "bin";
}

type UploadOk = { ok: true; key: string; url: string };
type UploadErr = { ok?: false; error: string; message?: string };

export async function POST(req: NextRequest) {
  try {
    // ✅ real admin gate (throws Unauthorized/Forbidden)
    await requireAdminMemberId();

    const accountId = must(process.env.R2_ACCOUNT_ID, "R2_ACCOUNT_ID");
    const accessKeyId = must(process.env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID");
    const secretAccessKey = must(
      process.env.R2_SECRET_ACCESS_KEY,
      "R2_SECRET_ACCESS_KEY",
    );
    const bucket = must(process.env.R2_BUCKET, "R2_BUCKET");

    // ✅ use your existing env var
    const publicBase = must(
      process.env.NEXT_PUBLIC_APP_URL,
      "NEXT_PUBLIC_APP_URL",
    );

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      const body: UploadErr = {
        ok: false,
        error: "BadRequest",
        message: "Expected form field 'file'.",
      };
      return NextResponse.json(body, { status: 400 });
    }

    const contentType = file.type || "application/octet-stream";
    const allowed = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ]);
    if (!allowed.has(contentType)) {
      const body: UploadErr = {
        ok: false,
        error: "UnsupportedMediaType",
        message: `Unsupported type: ${contentType}`,
      };
      return NextResponse.json(body, { status: 415 });
    }

    const maxBytes = 6 * 1024 * 1024; // 6MB
    if (file.size > maxBytes) {
      const body: UploadErr = {
        ok: false,
        error: "PayloadTooLarge",
        message: `Max ${maxBytes} bytes.`,
      };
      return NextResponse.json(body, { status: 413 });
    }

    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");

    const base = safeName(file.name.replace(/\.[^.]+$/, "")) || "image";
    const ext = extFromType(contentType);
    const id =
      crypto.randomUUID?.() ??
      `${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`;

    // Keep under /gfx so it matches your site convention
    const key = `gfx/campaigns/${yyyy}/${mm}/${id}_${base}.${ext}`;

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

    const s3 = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });

    const bytes = new Uint8Array(await file.arrayBuffer());

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    // If /gfx is publicly served from your app domain, this is correct.
    const url = `${publicBase.replace(/\/$/, "")}/${key}`;

    const body: UploadOk = { ok: true, key, url };
    return NextResponse.json(body);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);

    // Map auth errors to sane HTTP codes
    const status =
      msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;

    const body: UploadErr = { ok: false, error: "UploadFailed", message: msg };
    return NextResponse.json(body, { status });
  }
}
