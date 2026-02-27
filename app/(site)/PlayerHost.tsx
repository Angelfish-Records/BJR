// web/app/(site)/PlayerHost.tsx
"use client";

import React from "react";
import { PlayerStateProvider } from "@/app/home/player/PlayerState";
import AudioEngine from "@/app/home/player/AudioEngine";
import TrackTitleSync from "@/app/home/player/TrackTitleSync";
import StageInlineHost from "@/app/home/player/StageInlineHost";

export default function PlayerHost({
  children,
}: {
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const tag = "[NAV]";
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);

    const log = (
      kind: "pushState" | "replaceState",
      url?: string | URL | null,
    ) => {
      try {
        const href = String(url ?? "");
        const from = window.location.pathname;

        const toPath = href.startsWith("http")
          ? new URL(href).pathname
          : (href.split("?")[0] || "").trim();

        if (
          (from === "/portal" && toPath === "/journal") ||
          href.includes("/journal") ||
          href.includes("/portal") ||
          // legacy (avoid breaking old in-flight links/history)
          href.includes("/posts") ||
          href.includes("/extras")
        ) {
          console.log(tag, kind, { from, href }, new Error().stack);
        }
      } catch {
        // ignore
      }
    };

    window.history.pushState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): void {
      log("pushState", url);
      origPush(data, unused, url);
    };

    window.history.replaceState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): void {
      log("replaceState", url);
      origReplace(data, unused, url);
    };

    const onPop = () => {
      console.log(tag, "popstate", { href: window.location.href });
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  return (
    <PlayerStateProvider>
      <AudioEngine />
      <StageInlineHost />
      <TrackTitleSync fallbackLeaf="Consolers" mode="track" />
      {children}
    </PlayerStateProvider>
  );
}
