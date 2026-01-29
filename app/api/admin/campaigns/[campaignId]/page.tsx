import 'server-only'
import {requireAdminMemberId} from '@/lib/adminAuth'
import CampaignComposerClient from './CampaignComposerClient'

export const runtime = 'nodejs'

export default async function AdminCampaignPage({
  params,
}: {
  params: {campaignId: string}
}) {
  await requireAdminMemberId()
  return <CampaignComposerClient campaignId={params.campaignId} />
}
