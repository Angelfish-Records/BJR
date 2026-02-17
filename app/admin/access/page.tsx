// web/app/admin/access/page.tsx
import "server-only";
import AccessDashboard from "./AccessDashboard";

export default async function Page(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const tab = typeof sp.tab === "string" ? sp.tab : "entitlements";
  const embed = typeof sp.embed === "string" && sp.embed === "1";
  return <AccessDashboard tab={tab} embed={embed} />;
}
