// web/app/admin/access/AccessDashboard.tsx
import "server-only";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

import { ENTITLEMENTS } from "@/lib/vocab";
import { checkAccess } from "@/lib/access";
import { listAlbumsForBrowse } from "@/lib/albums";

// Reuse existing panels (leave them where they are for now)
import AdminMintShareTokenForm from "../share-tokens/AdminMintShareTokenForm";
import AdminEntitlementsPanel from "../share-tokens/AdminEntitlementsPanel";

type TabId = "tokens" | "entitlements";

async function getMemberIdByClerkUserId(
  userId: string,
): Promise<string | null> {
  if (!userId) return null;
  const r = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  return (r.rows?.[0]?.id as string | undefined) ?? null;
}

function asTab(v: unknown): TabId {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "entitlements" ? "entitlements" : "tokens";
}

export default async function AccessDashboard(props: {
  tab?: unknown;
  embed?: boolean;
}) {
  const tab = asTab(props.tab);
  const embed = props.embed === true;

  const { userId } = await auth();
  if (!userId) redirect("/home");

  const memberId = await getMemberIdByClerkUserId(userId);
  if (!memberId) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Admin</h1>
        <p style={{ marginTop: 10, opacity: 0.8 }}>
          Signed in, but your member profile is still being created. Refresh in
          a moment.
        </p>
      </div>
    );
  }

  const adminDecision = await checkAccess(
    memberId,
    { kind: "global", required: [ENTITLEMENTS.ADMIN] },
    { log: false },
  );
  if (!adminDecision.allowed) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Admin</h1>
        <p style={{ marginTop: 10, opacity: 0.8 }}>Forbidden.</p>
      </div>
    );
  }

  const albums = await listAlbumsForBrowse();

  const shellStyle: React.CSSProperties = embed
    ? { padding: 0, margin: 0 }
    : { padding: 24, maxWidth: 980 };

  return (
    <div style={shellStyle}>
      <div style={{ padding: embed ? 16 : 0 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 10px" }}>Access dashboard</h1>
      </div>

      <div style={{ padding: embed ? 16 : 0, paddingTop: 0 }}>
        {tab === "entitlements" ? (
          <AdminEntitlementsPanel albums={albums} />
        ) : (
          <>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>
              Mint share / press tokens
            </h2>
            <AdminMintShareTokenForm albums={albums} />
          </>
        )}
      </div>

      {embed ? (
        <style>{`
          html, body { background: transparent !important; }
        `}</style>
      ) : null}
    </div>
  );
}
