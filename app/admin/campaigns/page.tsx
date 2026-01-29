import {redirect} from 'next/navigation'

export default function AdminCampaignsIndex() {
  redirect('/admin/campaigns/new')
}
