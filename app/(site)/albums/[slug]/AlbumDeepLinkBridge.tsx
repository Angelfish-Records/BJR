// web/app/(site)/albums/[slug]/AlbumDeepLinkBridge.tsx
"use client";

import React from "react";
import {
  useParams,
  useSearchParams,
  useRouter,
  usePathname,
} from "next/navigation";

function getSavedSt(slug: string): string {
  try {
    return (sessionStorage.getItem(`af_st:${slug}`) ?? "").trim();
  } catch {
    return "";
  }
}

function setSavedSt(slug: string, st: string) {
  try {
    sessionStorage.setItem(`af_st:${slug}`, st);
  } catch {
    // ignore
  }
}

export default function AlbumDeepLinkBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ slug: string }>();
  const sp = useSearchParams();

  React.useEffect(() => {
    if (pathname?.startsWith("/home")) return;

    const slug = params?.slug;
    if (!slug) return;

    const t = (sp.get("t") ?? "").trim();
    const stFromUrl = (sp.get("st") ?? sp.get("share") ?? "").trim();

    if (stFromUrl) setSavedSt(slug, stFromUrl);

    const st = stFromUrl || getSavedSt(slug);

    const next = new URLSearchParams();
    next.set("p", "player");
    next.set("album", slug);
    if (t) next.set("track", t);
    if (st) next.set("st", st);

    router.replace(`/home?${next.toString()}`);
  }, [router, pathname, params?.slug, sp]);

  return null;
}
