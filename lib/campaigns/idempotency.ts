//lib/campaigns/idempotency.ts
import crypto from 'crypto'

export function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}
