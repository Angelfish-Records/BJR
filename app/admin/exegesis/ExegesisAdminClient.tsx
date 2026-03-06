// web/app/admin/exegesis/ExegesisAdminClient.tsx
"use client";

import React from "react";
import ExegesisGroupTool from "./ExegesisGroupTool";
import ExegesisModerator from "./ExegesisModerator";

type Mode = "grouping" | "moderation";

export default function ExegesisAdminClient(props: { embed: boolean }) {
  const [mode, setMode] = React.useState<Mode>("grouping");

  const wrapClass = props.embed ? "" : "mx-auto max-w-6xl px-4 py-6";

  return (
    <div className={wrapClass}>
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs opacity-60 tracking-[0.14em]">ADMIN</div>
            <h1 className="mt-1 text-xl font-semibold">Exegesis admin</h1>
            <div className="mt-1 text-sm opacity-70">
              {mode === "grouping"
                ? "Line grouping (Phase B1)"
                : "Threads (lock/pin) · Reports (hide/unhide)"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={`rounded-md px-3 py-2 text-sm disabled:opacity-40 ${
                mode === "grouping"
                  ? "bg-white/15"
                  : "bg-white/5 hover:bg-white/10"
              }`}
              onClick={() => setMode("grouping")}
            >
              Grouping
            </button>
            <button
              className={`rounded-md px-3 py-2 text-sm disabled:opacity-40 ${
                mode === "moderation"
                  ? "bg-white/15"
                  : "bg-white/5 hover:bg-white/10"
              }`}
              onClick={() => setMode("moderation")}
            >
              Moderation
            </button>
          </div>
        </div>
      </div>
      <div className="mt-6">
        {mode === "grouping" ? <ExegesisGroupTool /> : <ExegesisModerator />}
      </div>
    </div>
  );
}
