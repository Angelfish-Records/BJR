import 'server-only'
import {redirect} from 'next/navigation'
import {requireAdminMemberId} from '@/lib/adminAuth'

export const runtime = 'nodejs'

export default async function AdminCampaignsIndexPage() {
  await requireAdminMemberId()

  // Create a fresh campaign (single sender + members audience handled server-side in enqueue route)
  const base = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? ''
  const res = await fetch(`${base}/api/admin/campaigns/enqueue`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    // Keep it minimal: composer can edit name/subject/body after redirect
    body: JSON.stringify({
      campaignName: 'New campaign',
      subjectTemplate: 'A note from Brendan',
      bodyTemplate: 'Write the email…',
      // audienceKey is enforced server-side; sender is now single-sender
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    // You can make a nicer error surface later; for now fail loudly
    const text = await res.text().catch(() => '')
    throw new Error(text || `Failed to create campaign (${res.status})`)
  }

  const data = (await res.json()) as {campaignId: string}
  redirect(`/admin/campaigns/${encodeURIComponent(data.campaignId)}`)
}
