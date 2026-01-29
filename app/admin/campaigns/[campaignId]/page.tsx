import 'server-only'
import {requireAdminMemberId} from '@/lib/adminAuth'
import CampaignComposerClient from './CampaignComposerClient'

export default async function AdminCampaignComposerPage({
  params,
}: {
  params: {campaignId: string}
}) {
  await requireAdminMemberId()
  return <CampaignComposerClient campaignId={params.campaignId} />
}
