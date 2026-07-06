// web/app/home/AdminRibbonBootstrap.tsx
"use client";

import React from "react";
import { useAuth } from "@clerk/nextjs";
import AdminRibbon from "@/app/home/AdminRibbon";

type AdminMeResponse = {
  ok?: boolean;
  isAdmin?: boolean;
};

export default function AdminRibbonBootstrap() {
  const { isLoaded, isSignedIn, userId } = useAuth();

  const [isAdmin, setIsAdmin] = React.useState(false);
  const [resolved, setResolved] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    if (!isLoaded) {
      setIsAdmin(false);
      setResolved(false);

      return () => {
        cancelled = true;
      };
    }

    if (!isSignedIn) {
      setIsAdmin(false);
      setResolved(true);

      return () => {
        cancelled = true;
      };
    }

    setResolved(false);

    async function run() {
      try {
        const res = await fetch("/api/admin/me", {
          method: "GET",
          cache: "no-store",
        });

        const raw: unknown = await res.json().catch(() => null);
        const data =
          raw && typeof raw === "object" ? (raw as AdminMeResponse) : null;

        if (cancelled) return;

        setIsAdmin(Boolean(data?.ok && data?.isAdmin));
      } catch {
        if (cancelled) return;
        setIsAdmin(false);
      } finally {
        if (!cancelled) setResolved(true);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const body = document.body;
    if (resolved && isAdmin) body.dataset.afIsAdmin = "1";
    else delete body.dataset.afIsAdmin;

    return () => {
      delete body.dataset.afIsAdmin;
    };
  }, [resolved, isAdmin]);

  if (!resolved || !isAdmin) return null;

  return <AdminRibbon isAdmin={true} />;
}
