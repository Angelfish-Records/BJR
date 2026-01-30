"use client";

import React from "react";

export default function DockPlaceholder() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "grid", gap: 2 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Dock (persistent)</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>
          Player goes here next (Mux tokens later).
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          style={{
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.9)",
            padding: "8px 10px",
            fontSize: 13,
            cursor: "pointer",
            opacity: 0.85,
          }}
        >
          Play
        </button>
        <button
          type="button"
          style={{
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.9)",
            padding: "8px 10px",
            fontSize: 13,
            cursor: "pointer",
            opacity: 0.85,
          }}
        >
          Queue
        </button>
      </div>
    </div>
  );
}
