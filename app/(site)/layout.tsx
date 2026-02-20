// web/app/(site)/layout.tsx
import React from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ensureMemberByClerk } from "@/lib/members";
import { checkAccess } from "@/lib/access";
import { ENTITLEMENTS } from "@/lib/vocab";
import AdminDebugBar from "@/app/home/AdminDebugBar";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function SiteLayout(props: { children: React.ReactNode }) {
  const { userId } = await auth();

  let isAdmin = false;

  if (userId) {
    const user = await currentUser();
    const email =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      null;

    if (email) {
      const ensured = await ensureMemberByClerk({
        clerkUserId: userId,
        email,
        source: "site_layout_clerk",
        sourceDetail: { route: "(site)" },
      });

      const d = await checkAccess(
        ensured.id,
        { kind: "global", required: [ENTITLEMENTS.ADMIN] },
        { log: false },
      );
      isAdmin = d.allowed;
    }
  }

  return (
    <>
      {isAdmin ? <AdminDebugBar isAdmin /> : null}
      {props.children}
    </>
  );
}