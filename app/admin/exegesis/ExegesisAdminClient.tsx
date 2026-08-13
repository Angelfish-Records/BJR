// web/app/admin/exegesis/ExegesisAdminClient.tsx
"use client";

import React from "react";
import AdminPageFrame from "../AdminPageFrame";
import ExegesisGroupTool from "./ExegesisGroupTool";
import ExegesisModerator from "./ExegesisModerator";

type Mode = "grouping" | "moderation";

export default function ExegesisAdminClient(
  props: Readonly<{ embed: boolean }>,
) {
  const [mode, setMode] = React.useState<Mode>("grouping");

  const modeActions = (
    <>
      <button
        type="button"
        onClick={() => setMode("grouping")}
        style={{
          height: 32,
          padding: "0 12px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            mode === "grouping"
              ? "rgba(255,255,255,0.10)"
              : "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.92)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          opacity: mode === "grouping" ? 1 : 0.82,
        }}
      >
        Grouping
      </button>
      <button
        type="button"
        onClick={() => setMode("moderation")}
        style={{
          height: 32,
          padding: "0 12px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            mode === "moderation"
              ? "rgba(255,255,255,0.10)"
              : "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.92)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          opacity: mode === "moderation" ? 1 : 0.82,
        }}
      >
        Moderation
      </button>
    </>
  );

  return (
    <AdminPageFrame
      embed={props.embed}
      maxWidth={1280}
      title="Exegesis admin"
      subtitle={
        mode === "grouping"
          ? "Arrange lyric lines into the discussion groups readers will see."
          : "Review comments, manage discussion state, and handle reports."
      }
      headerActions={modeActions}
    >
      <div style={{ marginTop: 4, minWidth: 0 }}>
        {mode === "grouping" ? <ExegesisGroupTool /> : <ExegesisModerator />}
      </div>
    </AdminPageFrame>
  );
}
