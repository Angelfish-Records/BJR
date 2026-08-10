// web/app/admin/exegesis/ExegesisModerator.tsx
"use client";

import React from "react";

type ThreadRow = {
  recordingId: string;
  groupKey: string;
  locked: boolean;
  pinnedCommentId: string | null;
  commentCount: number;
  lastActivityAt: string;
  updatedAt: string;
};

type ReportRow = {
  reportId: string;
  createdAt: string;
  category: string;
  reason: string;

  commentId: string;
  commentStatus: "live" | "hidden" | "deleted";
  recordingId: string;
  groupKey: string;
  lineKey: string;
  bodyPlain: string;
  commentCreatedAt: string;
};

type LyricsCatalogueResponse =
  | {
      ok: true;
      albums: Array<{
        tracks?: Array<{
          recordingId: string;
          displayId: string;
        }>;
      }>;
    }
  | {
      ok: false;
      error: string;
    };

function fmtTime(s: string): string {
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toLocaleString();
}

function deriveLineKeyFromGroupKey(groupKey: string): string {
  const g = (groupKey ?? "").trim();
  if (g.startsWith("lk:")) return g.slice(3).trim();
  return "";
}

export default function ExegesisModerator() {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [threads, setThreads] = React.useState<ThreadRow[]>([]);
  const [reports, setReports] = React.useState<ReportRow[]>([]);
  const [displayIdByRecordingId, setDisplayIdByRecordingId] = React.useState<
    Record<string, string>
  >({});
  const [limit, setLimit] = React.useState(60);

  async function refresh() {
    setErr("");
    setBusy(true);
    try {
      const [tRes, rRes, cRes] = await Promise.all([
        fetch(
          `/api/admin/exegesis/threads?limit=${encodeURIComponent(limit)}`,
          {
            cache: "no-store",
          },
        ),
        fetch(
          `/api/admin/exegesis/reports?limit=${encodeURIComponent(limit)}`,
          {
            cache: "no-store",
          },
        ),
        fetch("/api/lyrics/catalogue", {
          cache: "no-store",
        }),
      ]);

      const tj = (await tRes.json()) as
        | { ok: true; threads: ThreadRow[] }
        | { ok: false; error: string };
      if (!tj.ok) throw new Error(tj.error || "Failed to load threads.");

      const rj = (await rRes.json()) as
        | { ok: true; reports: ReportRow[] }
        | { ok: false; error: string };
      if (!rj.ok) throw new Error(rj.error || "Failed to load reports.");

      const cj = (await cRes.json()) as LyricsCatalogueResponse;
      if (!cj.ok) throw new Error(cj.error || "Failed to load catalogue.");

      const nextDisplayIdByRecordingId: Record<string, string> = {};
      for (const album of cj.albums ?? []) {
        for (const track of album.tracks ?? []) {
          const recordingId = (track.recordingId ?? "").trim();
          const displayId = (track.displayId ?? "").trim();
          if (!recordingId || !displayId) continue;
          nextDisplayIdByRecordingId[recordingId] = displayId;
        }
      }

      setThreads(tj.threads ?? []);
      setReports(rj.reports ?? []);
      setDisplayIdByRecordingId(nextDisplayIdByRecordingId);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  async function setLocked(
    recordingId: string,
    groupKey: string,
    locked: boolean,
  ) {
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/exegesis/thread/lock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordingId, groupKey, locked }),
      });
      const j = (await r.json()) as
        | { ok: true; meta: ThreadRow }
        | { ok: false; error: string };
      if (!j.ok) throw new Error(j.error || "Lock update failed.");

      setThreads((prev) =>
        prev.map((t) =>
          t.recordingId === recordingId && t.groupKey === groupKey
            ? { ...t, locked: j.meta.locked, updatedAt: j.meta.updatedAt }
            : t,
        ),
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setPinned(
    recordingId: string,
    groupKey: string,
    pinnedCommentId: string | null,
  ) {
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/exegesis/thread/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordingId, groupKey, pinnedCommentId }),
      });
      const j = (await r.json()) as
        | { ok: true; meta: ThreadRow }
        | { ok: false; error: string };
      if (!j.ok) throw new Error(j.error || "Pin update failed.");

      setThreads((prev) =>
        prev.map((t) =>
          t.recordingId === recordingId && t.groupKey === groupKey
            ? {
                ...t,
                pinnedCommentId: j.meta.pinnedCommentId,
                updatedAt: j.meta.updatedAt,
              }
            : t,
        ),
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setCommentHidden(
    commentId: string,
    nextStatus: "live" | "hidden",
  ) {
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/exegesis/comment/hide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commentId, nextStatus }),
      });
      const j = (await r.json()) as
        | {
            ok: true;
            comment: { id: string; status: "live" | "hidden" | "deleted" };
          }
        | { ok: false; error: string };
      if (!j.ok) throw new Error(j.error || "Comment update failed.");

      setReports((prev) =>
        prev.map((x) =>
          x.commentId === commentId
            ? { ...x, commentStatus: j.comment.status }
            : x,
        ),
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <select
            className="rounded-md bg-white/5 px-3 py-2 text-sm outline-none"
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[25, 50, 60, 100, 200].map((n) => (
              <option key={n} value={String(n)}>
                {n} rows
              </option>
            ))}
          </select>

          <button
            type="button"
            className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-40"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-md bg-white/5 p-3 text-sm">{err}</div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm opacity-70">Threads</div>
            <div className="text-xs opacity-60">{threads.length} loaded</div>
          </div>

          <div className="mt-3 space-y-2">
            {threads.length === 0 ? (
              <div className="text-sm opacity-60">No thread meta rows yet.</div>
            ) : (
              threads.map((t) => {
                const lineKey = deriveLineKeyFromGroupKey(t.groupKey);
                const displayId =
                  displayIdByRecordingId[t.recordingId] ?? t.recordingId;
                const href =
                  `/exegesis/${encodeURIComponent(displayId)}` +
                  (lineKey ? `#l=${encodeURIComponent(lineKey)}` : "");

                return (
                  <div
                    key={`${t.recordingId}::${t.groupKey}`}
                    className="rounded-md bg-black/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold opacity-90">
                          <a
                            className="underline underline-offset-2"
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {displayId}
                          </a>
                        </div>
                        <div className="mt-1 text-xs opacity-60">
                          {t.groupKey} · {t.commentCount} comments · last:{" "}
                          {fmtTime(t.lastActivityAt)}
                        </div>
                        {t.pinnedCommentId ? (
                          <div className="mt-1 text-xs opacity-65">
                            pinned:{" "}
                            <a
                              className="underline underline-offset-2"
                              href={`${href}${href.includes("#") ? "&" : "#"}c=${encodeURIComponent(
                                t.pinnedCommentId,
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t.pinnedCommentId}
                            </a>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                          disabled={busy}
                          onClick={() =>
                            void setLocked(t.recordingId, t.groupKey, !t.locked)
                          }
                          title="Lock/unlock thread"
                        >
                          {t.locked ? "Locked" : "Unlocked"}
                        </button>

                        <button
                          type="button"
                          className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                          disabled={busy || !t.pinnedCommentId}
                          onClick={() =>
                            void setPinned(t.recordingId, t.groupKey, null)
                          }
                          title="Unpin"
                        >
                          Unpin
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-xs opacity-60">
                      Tip: pin/unpin is easiest from the Reports panel (pick the
                      root you want pinned).
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm opacity-70">Reports</div>
            <div className="text-xs opacity-60">{reports.length} loaded</div>
          </div>

          <div className="mt-3 space-y-2">
            {reports.length === 0 ? (
              <div className="text-sm opacity-60">No reports yet.</div>
            ) : (
              reports.map((r) => {
                const displayId =
                  displayIdByRecordingId[r.recordingId] ?? r.recordingId;
                const threadHref =
                  `/exegesis/${encodeURIComponent(displayId)}` +
                  `#l=${encodeURIComponent(r.lineKey)}&c=${encodeURIComponent(r.commentId)}`;

                const threadKey = `${r.recordingId}::${r.groupKey}`;

                return (
                  <div key={r.reportId} className="rounded-md bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs opacity-70">
                          <span className="opacity-90">{r.category}</span> ·{" "}
                          {fmtTime(r.createdAt)}
                        </div>
                        <div className="mt-1 text-sm opacity-90 line-clamp-3">
                          {r.reason}
                        </div>
                        <div className="mt-2 text-xs opacity-60">
                          comment:{" "}
                          <a
                            className="underline underline-offset-2"
                            href={threadHref}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.commentId}
                          </a>{" "}
                          · status:{" "}
                          <span className="opacity-85">{r.commentStatus}</span>
                        </div>
                        <div className="mt-1 text-xs opacity-60">
                          thread:{" "}
                          <span className="opacity-85">{threadKey}</span>
                        </div>
                        <div className="mt-2 text-sm opacity-90 line-clamp-4">
                          “{r.bodyPlain}”
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        {r.commentStatus !== "deleted" ? (
                          <>
                            <button
                              type="button"
                              className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                              disabled={busy}
                              onClick={() =>
                                void setCommentHidden(
                                  r.commentId,
                                  r.commentStatus === "hidden"
                                    ? "live"
                                    : "hidden",
                                )
                              }
                              title="Hide/unhide comment"
                            >
                              {r.commentStatus === "hidden" ? "Unhide" : "Hide"}
                            </button>

                            <button
                              type="button"
                              className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                              disabled={busy}
                              onClick={() =>
                                void setPinned(
                                  r.recordingId,
                                  r.groupKey,
                                  r.commentId,
                                )
                              }
                              title="Pin (roots only)"
                            >
                              Pin
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-3 text-xs opacity-60">
            Pin will fail (by design) unless the comment is a root. Hide/unhide
            works for any non-deleted comment.
          </div>
        </div>
      </div>
    </div>
  );
}
