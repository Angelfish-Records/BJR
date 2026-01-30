// web/app/gift/claim/page.tsx
import "server-only";
import { redirect } from "next/navigation";

export const runtime = "nodejs";

function safeStr(v: unknown): string {
  return (typeof v === "string" ? v : "").trim();
}

export default function GiftClaimRedirectPage(props: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const gRaw = props.searchParams?.g;
  const giftId = safeStr(Array.isArray(gRaw) ? gRaw[0] : gRaw);

  // Old emails still carry g=...; we ignore c=... entirely now.
  if (giftId) redirect(`/gift/${encodeURIComponent(giftId)}`);

  redirect("/home?gift=missing");
}
