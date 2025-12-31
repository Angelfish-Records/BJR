import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)

  const email = (body?.email ?? '').toString().trim().toLowerCase()
  const honey = (body?.company ?? '').toString().trim() // honeypot for bots

  if (honey) return NextResponse.json({ok: true})
  if (!emailOk(email)) return NextResponse.json({ok: false}, {status: 400})

  await sql`
    insert into members (id, email, tier, source, email_consent_at, updated_at)
    values (gen_random_uuid(), ${email}, 'free', 'landing_form', now(), now())
    on conflict (email)
    do update set updated_at = now()
  `

  return NextResponse.json({ok: true})
}

export {}