// web/app/api/admin/campaigns/images/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAdminMemberId } from "@/lib/adminAuth";

function must(v: string | undefined, name: string): string {
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
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
type UploadErr = { ok?: false; error: string; message?: string; code?: string };

// Narrow AWS / R2 error shape without `any`
function asAwsError(
  e: unknown,
): {
  message?: string;
  code?: string;
  httpStatusCode?: number;
  requestId?: string;
  cfId?: string;
} {
  if (typeof e !== "object" || e === null) return {};

  const rec = e as Record<string, unknown>;
  const meta =
    typeof rec.$metadata === "object" && rec.$metadata !== null
      ? (rec.$metadata as Record<string, unknown>)
      : {};

  return {
    message: typeof rec.message === "string" ? rec.message : undefined,
    code:
      typeof rec.Code === "string"
        ? rec.Code
        : typeof rec.code === "string"
          ? rec.code
          : undefined,
    httpStatusCode:
      typeof meta.httpStatusCode === "number"
        ? meta.httpStatusCode
        : undefined,
    requestId:
      typeof meta.requestId === "string" ? meta.requestId : undefined,
    cfId: typeof meta.cfId === "string" ? meta.cfId : undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminMemberId();

    const accessKeyId = must(
      process.env.R2_UPLOAD_ACCESS_KEY_ID,
      "R2_UPLOAD_ACCESS_KEY_ID",
    );
    const secretAccessKey = must(
      process.env.R2_UPLOAD_SECRET_ACCESS_KEY,
      "R2_UPLOAD_SECRET_ACCESS_KEY",
    );
    const bucket = must(process.env.R2_UPLOAD_BUCKET, "R2_UPLOAD_BUCKET");
    const endpoint = must(process.env.R2_UPLOAD_ENDPOINT, "R2_UPLOAD_ENDPOINT");
    const region = (process.env.R2_UPLOAD_REGION || "auto").trim() || "auto";

    const publicBase = must(
      process.env.R2_UPLOAD_PUBLIC_BASE_URL,
      "R2_UPLOAD_PUBLIC_BASE_URL",
    ).replace(/\/$/, "");

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

    const maxBytes = 6 * 1024 * 1024;
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

    const key = `gfx/campaigns/${yyyy}/${mm}/${id}_${base}.${ext}`;

    const s3 = new S3Client({
      region,
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

    const url = `${publicBase}/${key}`;
    const body: UploadOk = { ok: true, key, url };
    return NextResponse.json(body);
  } catch (e: unknown) {
    const aws = asAwsError(e);

    console.error("R2 upload error", {
      message: aws.message,
      code: aws.code,
      status: aws.httpStatusCode,
      requestId: aws.requestId,
      cfId: aws.cfId,
    });

    const msg =
      aws.message ??
      (e instanceof Error ? e.message : "Unknown upload error");

    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;

    const body: UploadErr = {
      ok: false,
      error: "UploadFailed",
      message: msg,
      code: aws.code,
    };
    return NextResponse.json(body, { status });
  }
}
