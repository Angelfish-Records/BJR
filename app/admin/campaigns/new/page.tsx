import 'server-only'
import {redirect} from 'next/navigation'
import {requireAdminMemberId} from '@/lib/adminAuth'

export const runtime = 'nodejs'

export default async function AdminCampaignsNew() {
  await requireAdminMemberId()

  // Use same-origin relative fetch (works on Vercel) by constructing from headers is annoying;
  // simplest is to call the DB directly, but since you already have enqueue, call it server-side via relative URL:
  const res = await fetch('http://localhost:3000/api/admin/campaigns/enqueue', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      audienceKey: 'members_marketing_v1',
      campaignName: 'New campaign',
      subjectTemplate: 'A note from Brendan',
      bodyTemplate: 'Write the email…',
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Failed to create campaign (${res.status})`)
  }

  const data = (await res.json()) as {campaignId: string}
  redirect(`/admin/campaigns/${data.campaignId}`)
}
