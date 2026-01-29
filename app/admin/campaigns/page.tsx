import 'server-only'
import {redirect} from 'next/navigation'
import {requireAdminMemberId} from '@/lib/adminAuth'

export default async function AdminCampaignsIndexPage() {
  await requireAdminMemberId()
  redirect('/admin/campaigns/new')
}
