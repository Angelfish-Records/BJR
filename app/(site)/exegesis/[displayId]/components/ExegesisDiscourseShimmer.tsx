// web/app/(site)/exegesis/[displayId]/components/ExegesisDiscourseShimmer.tsx
"use client";

import React from "react";

export default function ExegesisDiscourseShimmer() {
  return (
    <div className="rounded-xl p-1">
      <div className="mt-2 rounded-md bg-black/20 p-3">
        <div className="space-y-2">
          <div className="afShimmerBlock h-4 w-[90%] rounded bg-white/5" />
          <div className="afShimmerBlock h-4 w-[72%] rounded bg-white/5" />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-white/6 p-3">
        <div className="afShimmerBlock h-9 w-full rounded-md bg-white/5" />
        <div className="mt-2 flex items-center justify-between">
          <div className="afShimmerBlock h-5 w-10 rounded-md bg-white/5" />
          <div className="afShimmerBlock h-4 w-16 rounded bg-white/5" />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-md bg-black/20 p-3">
          <div className="afShimmerBlock h-3 w-24 rounded bg-white/5" />
          <div className="mt-2 space-y-2">
            <div className="afShimmerBlock h-4 w-[92%] rounded bg-white/5" />
            <div className="afShimmerBlock h-4 w-[76%] rounded bg-white/5" />
          </div>
        </div>

        <div className="rounded-md bg-black/20 p-3">
          <div className="afShimmerBlock h-3 w-20 rounded bg-white/5" />
          <div className="mt-2 space-y-2">
            <div className="afShimmerBlock h-4 w-[88%] rounded bg-white/5" />
            <div className="afShimmerBlock h-4 w-[66%] rounded bg-white/5" />
          </div>
        </div>
      </div>
    </div>
  );
}