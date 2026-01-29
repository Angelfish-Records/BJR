import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'

export const runtime = 'nodejs'

type Json =
  | string
  | number
  | boolean
  | null
  | {[key: string]: Json}
  | Json[]

type CampaignRow = {
  id: string
  name: string
  audience_key: string
  sender_key: string
  from_email: string
  reply_to: string | null
  subject_template: string
  body_template: string
  filters: Json
  status: string
  locked_at: string | null
  locked_by: string | null
  cancel_requested_at: string | null
  created_at: string
  updated_at: string
}

function requireActor() {
  // You can harden auth later; GET can be open to admins only if you want.
  return {memberId: process.env.BJR_ADMIN_MEMBER_ID ?? null, actorLabel: 'admin'}
}

export async function GET(_req: NextRequest, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params

  try {
    const rows = await sql<CampaignRow>`
      select *
      from campaigns
      where id = ${id}::uuid
      limit 1
    `
    if (rows.rowCount === 0) return NextResponse.json({error: 'Not found'}, {status: 404})
    return NextResponse.json({campaign: rows.rows[0]})
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({error: 'Failed to load campaign', message: msg}, {status: 500})
  }
}

export async function PUT(req: NextRequest, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params
  const actor = requireActor()
  if (!actor.memberId) return NextResponse.json({error: 'Missing admin actor'}, {status: 401})

  const body = (await req.json().catch(() => null)) as
    | {
        name?: string
        subject_template?: string
        body_template?: string
        reply_to?: string | null
        status?: string
      }
    | null

  if (!body) return NextResponse.json({error: 'Invalid JSON'}, {status: 400})

  const fromEmail = process.env.RESEND_FROM_MARKETING
  if (!fromEmail) return NextResponse.json({error: 'RESEND_FROM_MARKETING not set'}, {status: 500})

  const senderKey = 'marketing'

  try {
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

    // If status transitioned to locked, set locked_at/locked_by
    const row = updated.rows[0]
    if (body.status === 'locked' && !row.locked_at) {
      const locked = await sql<CampaignRow>`
        update campaigns
        set locked_at = now(), locked_by = ${actor.actorLabel}, updated_at = now()
        where id = ${id}::uuid and locked_at is null
        returning *
      `
      return NextResponse.json({campaign: locked.rows[0]})
    }

    return NextResponse.json({campaign: row})
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({error: 'Failed to update campaign', message: msg}, {status: 500})
  }
}
