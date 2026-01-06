// web/lib/r2.ts
import 'server-only'
import {S3Client, GetObjectCommand, HeadObjectCommand} from '@aws-sdk/client-s3'
import {getSignedUrl} from '@aws-sdk/s3-request-presigner'

function must(v: string, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

const accountId = must(process.env.R2_ACCOUNT_ID ?? '', 'R2_ACCOUNT_ID')
const accessKeyId = must(process.env.R2_ACCESS_KEY_ID ?? '', 'R2_ACCESS_KEY_ID')
const secretAccessKey = must(process.env.R2_SECRET_ACCESS_KEY ?? '', 'R2_SECRET_ACCESS_KEY')
const bucket = must(process.env.R2_BUCKET ?? '', 'R2_BUCKET')

export const r2Bucket = bucket

export const r2 = new S3Client({
  region: process.env.R2_REGION ?? 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {accessKeyId, secretAccessKey},
})

export async function assertObjectExists(key: string) {
  await r2.send(new HeadObjectCommand({Bucket: bucket, Key: key}))
}

export async function signGetObjectUrl(params: {
  key: string
  expiresInSeconds?: number
  responseContentType?: string
  responseContentDispositionFilename?: string
}) {
  const {
    key,
    expiresInSeconds = 60, // short TTL by default
    responseContentType,
    responseContentDispositionFilename,
  } = params

  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: responseContentType,
    ResponseContentDisposition: responseContentDispositionFilename
      ? `attachment; filename="${responseContentDispositionFilename}"`
      : undefined,
  })

  return getSignedUrl(r2, cmd, {expiresIn: expiresInSeconds})
}
