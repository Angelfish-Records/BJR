// web/app/home/player/MuxUploader.tsx
"use client";

import React from "react";

type CreateUploadResponse =
  | { ok: true; uploadId: string; url: string }
  | { ok: false; error: string };

type UploadStatusResponse =
  | {
      ok: true;
      status: string;
      ready: boolean;
      assetId?: string;
      playbackId?: string | null;
    }
  | { ok: false; error: string };

export default function MuxUploader(props: {
  onReady: (payload: {
    uploadId: string;
    assetId?: string;
    playbackId: string;
  }) => void;
  disabled?: boolean;
}) {
  const { onReady, disabled = false } = props;

  const [uploadId, setUploadId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string>("idle");
  const [playbackId, setPlaybackId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function createUpload(): Promise<{ uploadId: string; url: string }> {
    const res = await fetch("/api/mux/create-upload", { method: "POST" });
    const data = (await res.json()) as CreateUploadResponse;
    if (!data.ok) throw new Error(data.error || "Failed to create upload");
    return { uploadId: data.uploadId, url: data.url };
  }

  async function pollUntilReady(
    id: string,
  ): Promise<{ assetId?: string; playbackId: string }> {
    for (let i = 0; i < 60; i++) {
      const res = await fetch("/api/mux/upload-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: id }),
      });
      const data = (await res.json()) as UploadStatusResponse;
      if (!data.ok)
        throw new Error(data.error || "Failed to read upload status");

      setStatus(data.status || "processing");

      const pb = data.playbackId ?? null;
      if (data.ready && pb) return { assetId: data.assetId, playbackId: pb };

      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error("Timed out waiting for playbackId");
  }

  async function handleFile(file: File) {
    setErr(null);
    setPlaybackId(null);
    setStatus("starting");
    setBusy(true);

    try {
      const { uploadId: id, url } = await createUpload();
      setUploadId(id);
      setStatus("uploading");

      const put = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      setStatus("processing");

      const ready = await pollUntilReady(id);
      setPlaybackId(ready.playbackId);
      setStatus("ready");

      onReady({
        uploadId: id,
        assetId: ready.assetId,
        playbackId: ready.playbackId,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(0,0,0,0.18)",
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.85 }}>Mux uploader (dev)</div>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.05)",
            padding: "8px 12px",
            fontSize: 13,
            cursor: disabled || busy ? "not-allowed" : "pointer",
            opacity: disabled || busy ? 0.5 : 0.9,
            userSelect: "none",
          }}
        >
          <input
            type="file"
            accept="audio/*"
            disabled={disabled || busy}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              // reset so selecting the same file twice still triggers
              e.currentTarget.value = "";
            }}
          />
          {busy ? "Working…" : "Upload audio"}
        </label>
      </div>

      <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
        status: {status}
        <br />
        uploadId: {uploadId ?? "—"}
        <br />
        playbackId: {playbackId ?? "—"}
      </div>

      {err ? (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(0,0,0,0.22)",
            padding: "8px 10px",
            fontSize: 12,
            opacity: 0.9,
          }}
        >
          {err}
        </div>
      ) : null}
    </div>
  );
}
