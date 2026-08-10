"use client";

import React from "react";
import type { RecordingSearchResult } from "../_lib/badgeDashboardTypes";

type Props = Readonly<{
  label: string;
  helpText: string | null;
  query: string;
  results: RecordingSearchResult[];
  error: string | null;
  loading: boolean;
  selectedRecording: RecordingSearchResult | null;
  selectedRecordingId: string;
  onQueryChange: (value: string) => void;
  onRunSearch: () => void;
  onSelectRecording: (recording: RecordingSearchResult) => void;
  onClearSelectedRecording: () => void;
}>;

export function RecordingPicker(props: Props) {
  const {
    label,
    helpText,
    query,
    results,
    error,
    loading,
    selectedRecording,
    selectedRecordingId,
    onQueryChange,
    onRunSearch,
    onSelectRecording,
    onClearSelectedRecording,
  } = props;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <span>{label}</span>

      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "end",
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ opacity: 0.78, fontSize: 12 }}>Search recording</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Track title, artist, album, or recording ID"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onRunSearch();
              }
            }}
          />
        </label>

        <button type="button" onClick={onRunSearch} disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {helpText ? (
        <span style={{ opacity: 0.62, fontSize: 12 }}>{helpText}</span>
      ) : null}

      {selectedRecording ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <strong>{selectedRecording.title}</strong>
              <span style={{ opacity: 0.75 }}>
                {selectedRecording.artist || "Unknown artist"}
                {selectedRecording.albumTitle
                  ? ` • ${selectedRecording.albumTitle}`
                  : ""}
              </span>
              <span style={{ opacity: 0.58, fontSize: 12 }}>
                {selectedRecording.recordingId}
              </span>
            </div>

            <button type="button" onClick={onClearSelectedRecording}>
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div style={{ color: "#ffb3b3", fontSize: 13 }}>{error}</div> : null}

      {!selectedRecording && results.length > 0 ? (
        <div
          style={{
            display: "grid",
            gap: 8,
          }}
        >
          {results.map((recording) => (
            <button
              key={recording.recordingId}
              type="button"
              onClick={() => onSelectRecording(recording)}
              style={{
                appearance: "none",
                textAlign: "left",
                color: "inherit",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: 12,
                cursor: "pointer",
                display: "grid",
                gap: 4,
              }}
            >
              <strong>{recording.title}</strong>
              <span style={{ opacity: 0.75 }}>
                {recording.artist || "Unknown artist"}
                {recording.albumTitle ? ` • ${recording.albumTitle}` : ""}
              </span>
              <span style={{ opacity: 0.55, fontSize: 12 }}>
                {recording.recordingId}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {selectedRecordingId ? (
        <span style={{ opacity: 0.55, fontSize: 12 }}>
          Selected recording ID: {selectedRecordingId}
        </span>
      ) : null}
    </div>
  );
}