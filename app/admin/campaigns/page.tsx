// web/app/admin/campaigns/page.tsx
import "server-only";
import { requireAdminMemberId } from "@/lib/adminAuth";
import CampaignComposerClient from "./CampaignComposerClient";

export default async function AdminCampaignsPage() {
  await requireAdminMemberId();
  return <CampaignComposerClient />;
}
