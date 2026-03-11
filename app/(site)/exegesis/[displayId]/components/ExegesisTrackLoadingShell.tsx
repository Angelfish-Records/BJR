// web/app/(site)/exegesis/[displayId]/components/ExegesisTrackLoadingShell.tsx
import React from "react";
import ExegesisDiscourseShimmer from "./ExegesisDiscourseShimmer";

export default function ExegesisTrackLoadingShell() {
  return (
    <div
      className="w-full max-w-none p-0 pb-4"
      style={
        {
          "--lxRow": "#2c2431",
          "--lxHover": "#564263",
          "--lxSelected": "#624e71",
        } as React.CSSProperties
      }
    >
      <style>{`
        @keyframes afShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        .afShimmerBlock {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.03) 0%,
            rgba(255, 255, 255, 0.08) 45%,
            rgba(255, 255, 255, 0.03) 100%
          );
          background-size: 200% 100%;
          animation: afShimmer 1.05s linear infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .afShimmerBlock {
            animation: none;
          }
        }
      `}</style>

      <div className="min-w-0 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="afShimmerBlock h-14 w-14 shrink-0 rounded-md bg-white/5" />

          <div className="min-w-0 flex-1">
            <div className="afShimmerBlock h-7 w-[52%] rounded bg-white/5" />
            <div className="mt-2 afShimmerBlock h-4 w-[28%] rounded bg-white/5" />
            <div className="mt-3 afShimmerBlock h-8 w-8 rounded-md bg-white/5" />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-6 md:grid-cols-[1fr_570px]">
        <div className="min-w-0">
          <div className="rounded-xl bg-white/[0.04] p-4">
            <div className="space-y-3">
              <div className="afShimmerBlock h-4 w-[78%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[64%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[82%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[59%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[74%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[68%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[86%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[57%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[72%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[61%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[84%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[66%] rounded bg-white/5" />
            </div>
          </div>
        </div>

        <div className="hidden md:block">
          <div className="rounded-xl bg-white/5 p-4">
            <ExegesisDiscourseShimmer />
          </div>
        </div>

        <div className="md:hidden">
          <div className="rounded-xl bg-white/5 p-4">
            <div className="text-sm opacity-60">Loading discussion…</div>
          </div>
        </div>
      </div>
    </div>
  );
}