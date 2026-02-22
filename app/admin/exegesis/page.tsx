// web/app/admin/exegesis/page.tsx
import "server-only";
import ExegesisAdminClient from "./ExegesisAdminClient";

export default async function Page(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const embed = typeof sp.embed === "string" && sp.embed === "1";
  return <ExegesisAdminClient embed={embed} />;
}