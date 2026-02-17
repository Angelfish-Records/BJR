// web/app/admin/mailbag/page.tsx
import "server-only";
import MailbagDashboardClient from "./MailbagDashboardClient";

export default async function Page(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const embed = typeof sp.embed === "string" && sp.embed === "1";
  return <MailbagDashboardClient embed={embed} />;
}
