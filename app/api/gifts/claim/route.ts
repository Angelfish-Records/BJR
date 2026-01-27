// web/app/api/gifts/claim/route.ts
import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import crypto from 'crypto'
import {sql} from '@vercel/postgres'
import {auth} from '@clerk/nextjs/server'
import {grantEntitlement} from '@/lib/entitlementOps'

export const runtime = 'nodejs'

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

type Req = {giftId: string; claimCode: string}

export async function POST(req: NextRequest) {
  const {userId} = await auth()
  if (!userId) return NextResponse.json({ok: false, error: 'UNAUTHENTICATED'}, {status: 401})

  const body = (await req.json().catch(() => null)) as Req | null
  const giftId = (body?.giftId ?? '').trim()
  const claimCode = (body?.claimCode ?? '').trim()
  if (!giftId || !claimCode) {
    return NextResponse.json({ok: false, error: 'MISSING_FIELDS'}, {status: 400})
  }

  const claimHash = sha256Hex(claimCode)

  // Resolve member id for this clerk user
  const m = await sql`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `
  const memberId = (m.rows[0]?.id as string | undefined) ?? null
  if (!memberId) return NextResponse.json({ok: false, error: 'MEMBER_NOT_FOUND'}, {status: 400})

  // Lock + validate gift
  const g = await sql`
    select id, status, entitlement_key, recipient_member_id, claim_code_hash
    from gifts
    where id = ${giftId}::uuid
    for update
  `
  const row = g.rows[0] as
    | {
        id: string
        status: string
        entitlement_key: string
        recipient_member_id: string | null
        claim_code_hash: string | null
      }
    | undefined
  if (!row) return NextResponse.json({ok: false, error: 'GIFT_NOT_FOUND'}, {status: 404})

  if (row.status !== 'paid') {
    return NextResponse.json({ok: false, error: 'GIFT_NOT_PAID'}, {status: 400})
  }
  if (!row.claim_code_hash || row.claim_code_hash !== claimHash) {
    return NextResponse.json({ok: false, error: 'INVALID_CLAIM'}, {status: 400})
  }

  // Attach gift to claimant if not already
  await sql`
    update gifts
    set recipient_member_id = coalesce(recipient_member_id, ${memberId}::uuid),
        status = 'claimed'::gift_status,
        claimed_at = coalesce(claimed_at, now()),
        claim_code_hash = null
    where id = ${giftId}::uuid
  `

  // Safety: ensure entitlement exists (idempotent on your grantEntitlement path)
  await grantEntitlement({
    memberId,
    entitlementKey: row.entitlement_key,
    grantedBy: 'system',
    grantReason: 'gift_claimed',
    grantSource: 'gift_claim',
    grantSourceRef: giftId,
    expiresAt: null,
    correlationId: giftId,
    eventSource: 'server',
  })

  return NextResponse.json({ok: true})
}
