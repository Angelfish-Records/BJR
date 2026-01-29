import 'server-only'
import * as React from 'react'
import {NextRequest, NextResponse} from 'next/server'
import {render as renderEmail} from '@react-email/render'
import {requireAdminMemberId} from '@/lib/adminAuth'
import CampaignEmail from '@/emails/CampaignEmail'

export const runtime = 'nodejs'

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId()

  const body = (await req.json().catch(() => null)) as null | {
    brandName?: string
    logoUrl?: string
    subject?: string
    bodyText?: string
    unsubscribeUrl?: string
  }

  const brandName = asString(body?.brandName).trim() || 'Brendan John Roch'
  const logoUrl = asString(body?.logoUrl).trim()
  const subject = asString(body?.subject).trim()
  const bodyText = asString(body?.bodyText)

  const html = await renderEmail(
    React.createElement(CampaignEmail, {
      brandName,
      logoUrl: logoUrl || undefined,
      bodyMarkdown: bodyText,
      unsubscribeUrl: asString(body?.unsubscribeUrl).trim() || undefined,
    }),
    {pretty: true}
  )

  return NextResponse.json({ok: true, subject, html})
}
