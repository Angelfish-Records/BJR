import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {requireAdminMemberId} from '@/lib/adminAuth'

export const runtime = 'nodejs'

type CampaignRow = {
  id: string
  name: string
  audience_key: string
  sender_key: string
  from_email: string
  reply_to: string | null
  subject_template: string
  body_template: string
  filters: unknown
  status: string
  locked_at: string | null
  locked_by: string | null
  cancel_requested_at: string | null
  created_at: string
  updated_at: string
}

type PutBody =
  | {
      name?: string
      subject_template?: string
      body_template?: string
      reply_to?: string | null
      status?: string
    }
  | null

export async function GET(_req: Request, ctx: {params: {id: string}}) {
  await requireAdminMemberId()

  const {id} = ctx.params
  const rows = await sql<CampaignRow>`
    select *
    from campaigns
    where id = ${id}::uuid
    limit 1
  `
  if (rows.rowCount === 0) {
    return NextResponse.json({error: 'Not found'}, {status: 404})
  }
  return NextResponse.json({campaign: rows.rows[0]})
}

export async function PUT(req: Request, ctx: {params: {id: string}}) {
  const actorMemberId = await requireAdminMemberId()
  const {id} = ctx.params

  const body: PutBody = await req.json().catch(() => null)
  if (!body) return NextResponse.json({error: 'Invalid JSON'}, {status: 400})

  const fromEmail = process.env.RESEND_FROM_MARKETING
  if (!fromEmail) return NextResponse.json({error: 'RESEND_FROM_MARKETING not set'}, {status: 500})

  // Schema still has sender_key; keep it constant for now (no UI).
  const senderKey = 'marketing'

  const updated = await sql<CampaignRow>`
    update campaigns
      set
        name = coalesce(${body.name ?? null}, name),
        subject_template = coalesce(${body.subject_template ?? null}, subject_template),
        body_template = coalesce(${body.body_template ?? null}, body_template),
        reply_to = ${body.reply_to ?? null},
        status = coalesce(${body.status ?? null}, status),
        from_email = ${fromEmail},
        sender_key = ${senderKey},
        updated_at = now()
    where id = ${id}::uuid
    returning *
  `
  if (updated.rowCount === 0) return NextResponse.json({error: 'Not found'}, {status: 404})

  const row = updated.rows[0]

  if (body.status === 'locked' && !row.locked_at) {
    const locked = await sql<CampaignRow>`
      update campaigns
        set locked_at = now(), locked_by = ${actorMemberId}::uuid, updated_at = now()
      where id = ${id}::uuid and locked_at is null
      returning *
    `
    return NextResponse.json({campaign: locked.rows[0]})
  }

  return NextResponse.json({campaign: row})
}
