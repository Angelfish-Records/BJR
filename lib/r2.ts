// web/lib/r2.ts
import "server-only";
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2Env = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucket: string;
  region: string;
};

function must(v: string | undefined, name: string): string {
  if (!v || !v.trim()) throw new Error(`Missing ${name}`);
  return v.trim();
}

function readEnv(): R2Env {
  // Cloudflare R2 expects region "auto" for S3 compatibility.
  const region = process.env.R2_REGION?.trim() || "auto";

  return {
    accessKeyId: must(process.env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID"),
    secretAccessKey: must(
      process.env.R2_SECRET_ACCESS_KEY,
      "R2_SECRET_ACCESS_KEY",
    ),
    endpoint: must(process.env.R2_ENDPOINT, "R2_ENDPOINT"),
    bucket: must(process.env.R2_BUCKET, "R2_BUCKET"),
    region,
  };
}

let _cached: { client: S3Client; bucket: string; endpoint: string } | null =
  null;

function getClient(): { client: S3Client; bucket: string } {
  if (_cached) return { client: _cached.client, bucket: _cached.bucket };

  const env = readEnv();

  const client = new S3Client({
    region: env.region,
    endpoint: env.endpoint,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    forcePathStyle: true, // important for R2/S3 compat
  });

  _cached = { client, bucket: env.bucket, endpoint: env.endpoint };
  return { client, bucket: env.bucket };
}

export async function assertObjectExists(key: string): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}

export async function signGetObjectUrl(params: {
  key: string;
  expiresInSeconds: number;
  responseContentType?: string;
  responseContentDispositionFilename?: string;
}): Promise<string> {
  const { client, bucket } = getClient();
  const {
    key,
    expiresInSeconds,
    responseContentType,
    responseContentDispositionFilename,
  } = params;

  const disposition = responseContentDispositionFilename
    ? `attachment; filename="${responseContentDispositionFilename}"`
    : undefined;

  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: responseContentType,
    ResponseContentDisposition: disposition,
  });

  return getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
}
