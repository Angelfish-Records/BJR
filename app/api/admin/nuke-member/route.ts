// web/app/api/admin/nuke-member/route.ts
import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'

/* ---------------- utils ---------------- */

function mustEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing env var: ${name}`)
  return v.trim()
}

function normalizeEmail(input: string): string {
  return (input ?? '').toString().trim().toLowerCase()
}

type NukeRequestBody = {
  email?: string
  memberId?: string
  clerkUserId?: string
}

type MemberRow = {
  id: string
  email: string
  clerk_user_id: string | null
}

type ClerkDeleteResult = {
  ok: boolean
  status: number
}

function rc(rowCount: number | null | undefined): number {
  return typeof rowCount === 'number' && Number.isFinite(rowCount) ? rowCount : 0
}

/* ---------------- Clerk ---------------- */

async function deleteClerkUser(clerkUserId: string): Promise<ClerkDeleteResult> {
  const secret = mustEnv('CLERK_SECRET_KEY')

  const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
  })

  // 404 is acceptable (already deleted)
  if (res.status === 404) {
    return {ok: true, status: 404}
  }

  return {ok: res.ok, status: res.status}
}

/* ---------------- route ---------------- */

export async function POST(req: NextRequest) {
  const adminSecret = mustEnv('ADMIN_NUKE_SECRET')
  const provided = req.headers.get('x-admin-secret')

  if (provided !== adminSecret) {
    return NextResponse.json({ok: false, error: 'Unauthorized'}, {status: 401})
  }

  const body = (await req.json().catch(() => null)) as NukeRequestBody | null
  const email = body?.email ? normalizeEmail(body.email) : null
  const memberId = body?.memberId ?? null

  if (!email && !memberId) {
    return NextResponse.json({ok: false, error: 'Provide email or memberId'}, {status: 400})
  }

  /* -------- locate member -------- */

  const found = await sql<MemberRow>`
    select id, email, clerk_user_id
    from members
    where
      (${memberId}::uuid is not null and id = ${memberId}::uuid)
      or
      (${email}::text is not null and email = ${email})
    limit 1
  `

  const member = found.rows[0] ?? null

  if (!member) {
    // Still allow explicit Clerk deletion if requested
    if (body?.clerkUserId) {
      const clerk = await deleteClerkUser(body.clerkUserId)
      return NextResponse.json({ok: true, memberDeleted: false, clerk})
    }

    return NextResponse.json({ok: true, memberDeleted: false})
  }

  /* -------- delete Neon rows -------- */

  const counts: Record<string, number> = {
    share_plays: 0,
    share_tokens: 0,
    purchases: 0,
    member_consents: 0,
    entitlement_grants: 0,
    member_events: 0,
    members: 0,
  }

  try {
    await sql`begin`

    counts.share_plays = rc((await sql`delete from share_plays where member_id = ${member.id}::uuid`).rowCount)
    counts.share_tokens = rc((await sql`delete from share_tokens where member_id = ${member.id}::uuid`).rowCount)
    counts.purchases = rc((await sql`delete from purchases where member_id = ${member.id}::uuid`).rowCount)
    counts.member_consents = rc(
      (await sql`delete from member_consents where member_id = ${member.id}::uuid`).rowCount
    )
    counts.entitlement_grants = rc(
      (await sql`delete from entitlement_grants where member_id = ${member.id}::uuid`).rowCount
    )
    counts.member_events = rc((await sql`delete from member_events where member_id = ${member.id}::uuid`).rowCount)
    counts.members = rc((await sql`delete from members where id = ${member.id}::uuid`).rowCount)

    await sql`commit`
  } catch (err) {
    try {
      await sql`rollback`
    } catch {}

    return NextResponse.json(
      {
        ok: false,
        error: 'Neon delete failed (likely missing FK table)',
        detail: err instanceof Error ? err.message : String(err),
      },
      {status: 500}
    )
  }

  /* -------- delete Clerk user -------- */

  let clerk: ClerkDeleteResult | null = null
  if (member.clerk_user_id) {
    clerk = await deleteClerkUser(member.clerk_user_id)
    if (!clerk.ok) {
      return NextResponse.json({ok: false, memberDeleted: true, counts, clerk}, {status: 502})
    }
  }

  return NextResponse.json({
    ok: true,
    memberDeleted: true,
    target: {memberId: member.id, email: member.email, clerkUserId: member.clerk_user_id},
    counts,
    clerk,
  })
}
