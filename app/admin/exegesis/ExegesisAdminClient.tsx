// web/app/admin/exegesis/ExegesisAdminClient.tsx
"use client";

import React from "react";

type ThreadRow = {
  trackId: string;
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
  trackId: string;
  groupKey: string;
  lineKey: string;
  bodyPlain: string;
  commentCreatedAt: string;
};

type LyricsApiCue = {
  lineKey: string;
  tMs: number;
  text: string;
  endMs?: number;
};
type LyricsApiOk = {
  ok: true;
  trackId: string;
  offsetMs: number;
  version: string;
  geniusUrl: string | null;
  cues: LyricsApiCue[];
};

type GroupMapOk = {
  ok: true;
  trackId: string;
  map: Record<string, { canonicalGroupKey: string; updatedAt: string }>;
  groups: Array<{
    canonicalGroupKey: string;
    count: number;
    updatedAt: string;
  }>;
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

export default function ExegesisAdminClient(props: { embed: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [threads, setThreads] = React.useState<ThreadRow[]>([]);
  const [reports, setReports] = React.useState<ReportRow[]>([]);
  const [limit, setLimit] = React.useState(60);

  const [groupTrackId, setGroupTrackId] = React.useState<string>("");
  const [lyrics, setLyrics] = React.useState<LyricsApiOk | null>(null);
  const [groupMap, setGroupMap] = React.useState<GroupMapOk | null>(null);
  const [selectedLineKeys, setSelectedLineKeys] = React.useState<
    Record<string, boolean>
  >({});
  const [targetGroupKey, setTargetGroupKey] = React.useState<string>("");

  const selectedKeys: string[] = Object.keys(selectedLineKeys).filter((k) =>
    Boolean(selectedLineKeys[k]),
  );

  function toggleSelect(lineKey: string) {
    setSelectedLineKeys((prev) => ({
      ...prev,
      [lineKey]: !Boolean(prev[lineKey]),
    }));
  }

  function clearSelection() {
    setSelectedLineKeys({});
  }

  type ApiErrShape = { ok: false; error: string };

  function isApiErrShape(v: unknown): v is ApiErrShape {
    if (typeof v !== "object" || v === null) return false;
    const r = v as Record<string, unknown>;
    return r.ok === false && typeof r.error === "string";
  }

  function assertOk<T extends { ok: true }>(
    j: unknown,
    fallbackMsg: string,
  ): asserts j is T {
    if (typeof j !== "object" || j === null) throw new Error(fallbackMsg);
    const r = j as Record<string, unknown>;
    if (r.ok !== true) {
      if (isApiErrShape(j)) throw new Error(j.error || fallbackMsg);
      throw new Error(fallbackMsg);
    }
  }

  async function loadGrouping() {
    const trackId = groupTrackId.trim();
    if (!trackId) {
      setErr("Enter a trackId for grouping.");
      return;
    }

    setErr("");
    setBusy(true);
    try {
      const lr = await fetch(
        `/api/lyrics?trackId=${encodeURIComponent(trackId)}`,
        { cache: "no-store" },
      );
      const lj: unknown = await lr.json();
      assertOk<LyricsApiOk>(lj, "Failed to load lyrics.");
      setLyrics(lj);

      const mr = await fetch(
        `/api/admin/exegesis/group-map?trackId=${encodeURIComponent(trackId)}`,
        { cache: "no-store" },
      );
      const mj: unknown = await mr.json();
      assertOk<GroupMapOk>(mj, "Failed to load group map.");
      setGroupMap(mj);

      setTargetGroupKey("");
      clearSelection();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load grouping.");
    } finally {
      setBusy(false);
    }
  }

  async function newGroup() {
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/exegesis/group-map/new-group", {
        method: "POST",
      });
      const j: unknown = await r.json();

      type NewGroupOk = { ok: true; canonicalGroupKey: string };
      function isNewGroupOk(v: unknown): v is NewGroupOk {
        if (typeof v !== "object" || v === null) return false;
        const rr = v as Record<string, unknown>;
        return rr.ok === true && typeof rr.canonicalGroupKey === "string";
      }

      if (!isNewGroupOk(j)) {
        if (isApiErrShape(j))
          throw new Error(j.error || "Failed to create group.");
        throw new Error("Failed to create group.");
      }

      setTargetGroupKey(j.canonicalGroupKey);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create group.");
    } finally {
      setBusy(false);
    }
  }

  async function assignSelectedToGroup() {
    const trackId = groupTrackId.trim();
    const gk = targetGroupKey.trim();
    if (!trackId) return;

    if (!gk) {
      setErr("Choose a canonical group key first.");
      return;
    }
    if (selectedKeys.length === 0) {
      setErr("Select at least one line.");
      return;
    }

    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/exegesis/group-map/set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trackId,
          canonicalGroupKey: gk,
          lineKeys: selectedKeys,
        }),
      });

      const j: unknown = await r.json();

      type SetOk = { ok: true; updated: number };
      function isSetOk(v: unknown): v is SetOk {
        if (typeof v !== "object" || v === null) return false;
        const rr = v as Record<string, unknown>;
        return rr.ok === true && typeof rr.updated === "number";
      }

      if (!isSetOk(j)) {
        if (isApiErrShape(j)) throw new Error(j.error || "Assign failed.");
        throw new Error("Assign failed.");
      }

      await loadGrouping();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Assign failed.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSelectedMapping() {
    const trackId = groupTrackId.trim();
    if (!trackId) return;

    if (selectedKeys.length === 0) {
      setErr("Select at least one line.");
      return;
    }

    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/exegesis/group-map/clear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackId, lineKeys: selectedKeys }),
      });

      const j: unknown = await r.json();

      type ClearOk = { ok: true; deleted: number };
      function isClearOk(v: unknown): v is ClearOk {
        if (typeof v !== "object" || v === null) return false;
        const rr = v as Record<string, unknown>;
        return rr.ok === true && typeof rr.deleted === "number";
      }

      if (!isClearOk(j)) {
        if (isApiErrShape(j)) throw new Error(j.error || "Clear failed.");
        throw new Error("Clear failed.");
      }

      await loadGrouping();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Clear failed.");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setErr("");
    setBusy(true);
    try {
      const [tRes, rRes] = await Promise.all([
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
      ]);

      const tj = (await tRes.json()) as
        | { ok: true; threads: ThreadRow[] }
        | { ok: false; error: string };
      if (!tj.ok) throw new Error(tj.error || "Failed to load threads.");

      const rj = (await rRes.json()) as
        | { ok: true; reports: ReportRow[] }
        | { ok: false; error: string };
      if (!rj.ok) throw new Error(rj.error || "Failed to load reports.");

      setThreads(tj.threads ?? []);
      setReports(rj.reports ?? []);
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

  async function setLocked(trackId: string, groupKey: string, locked: boolean) {
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/exegesis/thread/lock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackId, groupKey, locked }),
      });
      const j = (await r.json()) as
        | { ok: true; meta: ThreadRow }
        | { ok: false; error: string };
      if (!j.ok) throw new Error(j.error || "Lock update failed.");

      setThreads((prev) =>
        prev.map((t) =>
          t.trackId === trackId && t.groupKey === groupKey
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
    trackId: string,
    groupKey: string,
    pinnedCommentId: string | null,
  ) {
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/exegesis/thread/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackId, groupKey, pinnedCommentId }),
      });
      const j = (await r.json()) as
        | { ok: true; meta: ThreadRow }
        | { ok: false; error: string };
      if (!j.ok) throw new Error(j.error || "Pin update failed.");

      setThreads((prev) =>
        prev.map((t) =>
          t.trackId === trackId && t.groupKey === groupKey
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

  const wrapClass = props.embed ? "" : "mx-auto max-w-6xl px-4 py-6";

  return (
    <div className={wrapClass}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs opacity-60 tracking-[0.14em]">ADMIN</div>
          <h1 className="mt-1 text-xl font-semibold">Exegesis moderation</h1>
          <div className="mt-1 text-sm opacity-70">
            Threads (lock/pin) · Reports (hide/unhide)
          </div>
        </div>

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

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
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
                const href =
                  `/exegesis/${encodeURIComponent(t.trackId)}` +
                  (lineKey ? `#l=${encodeURIComponent(lineKey)}` : "");

                return (
                  <div
                    key={`${t.trackId}::${t.groupKey}`}
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
                            {t.trackId}
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
                              href={`${href}${href.includes("#") ? "&" : "#"}c=${encodeURIComponent(t.pinnedCommentId)}`}
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
                          className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                          disabled={busy}
                          onClick={() =>
                            void setLocked(t.trackId, t.groupKey, !t.locked)
                          }
                          title="Lock/unlock thread"
                        >
                          {t.locked ? "Locked" : "Unlocked"}
                        </button>

                        <button
                          className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                          disabled={busy || !t.pinnedCommentId}
                          onClick={() =>
                            void setPinned(t.trackId, t.groupKey, null)
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
                const threadHref =
                  `/exegesis/${encodeURIComponent(r.trackId)}` +
                  `#l=${encodeURIComponent(r.lineKey)}&c=${encodeURIComponent(r.commentId)}`;

                const threadKey = `${r.trackId}::${r.groupKey}`;

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
                              className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                              disabled={busy}
                              onClick={() => {
                                // Pin this comment if it's a root; server will reject if not.
                                void setPinned(
                                  r.trackId,
                                  r.groupKey,
                                  r.commentId,
                                );
                              }}
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

        <div className="rounded-xl bg-white/5 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-sm opacity-70">Line grouping (Phase B1)</div>
              <div className="mt-1 text-xs opacity-60">
                Map multiple lineKeys → one canonical groupKey (e.g. g:...).
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              className="w-full rounded-md bg-black/20 px-3 py-2 text-sm outline-none"
              placeholder="trackId"
              value={groupTrackId}
              onChange={(e) => setGroupTrackId(e.target.value)}
            />
            <button
              className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-40"
              disabled={busy || !groupTrackId.trim()}
              onClick={() => void loadGrouping()}
            >
              Load
            </button>
          </div>

          {lyrics ? (
            <div className="mt-3 text-xs opacity-60">
              {lyrics.cues.length} cues · lyrics v{lyrics.version}
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <button
              className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
              disabled={busy || !lyrics}
              onClick={() => void newGroup()}
              title="Create a new canonical groupKey"
            >
              New group
            </button>

            <select
              className="w-full rounded-md bg-black/20 px-3 py-2 text-sm outline-none"
              value={targetGroupKey}
              onChange={(e) => setTargetGroupKey(e.target.value)}
              disabled={!groupMap}
            >
              <option value="">Choose existing group…</option>
              {(groupMap?.groups ?? []).map((g) => (
                <option key={g.canonicalGroupKey} value={g.canonicalGroupKey}>
                  {g.canonicalGroupKey} ({g.count})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-xs opacity-60">
              {selectedKeys.length} selected
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                disabled={
                  busy ||
                  !lyrics ||
                  selectedKeys.length === 0 ||
                  !targetGroupKey.trim()
                }
                onClick={() => void assignSelectedToGroup()}
              >
                Assign
              </button>
              <button
                className="rounded-md bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-40"
                disabled={busy || !lyrics || selectedKeys.length === 0}
                onClick={() => void clearSelectedMapping()}
                title="Remove mapping and fall back to v1 lk:<lineKey>"
              >
                Clear
              </button>
              <button
                className="rounded-md bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-40"
                disabled={busy || selectedKeys.length === 0}
                onClick={() => clearSelection()}
              >
                Deselect
              </button>
            </div>
          </div>

          <div
            className="mt-3 space-y-2"
            style={{ maxHeight: 520, overflowY: "auto" }}
          >
            {!lyrics ? (
              <div className="text-sm opacity-60">
                Load a track to begin grouping.
              </div>
            ) : (
              (lyrics.cues ?? []).map((c) => {
                const mapped = groupMap?.map?.[c.lineKey];
                const isSel = Boolean(selectedLineKeys[c.lineKey]);

                return (
                  <button
                    key={c.lineKey}
                    className={`w-full rounded-md bg-black/20 p-3 text-left hover:bg-black/25 ${
                      isSel ? "ring-1 ring-white/20" : ""
                    }`}
                    onClick={() => toggleSelect(c.lineKey)}
                    title="Click to select/deselect"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs opacity-60">
                          {c.lineKey} · {c.tMs}ms
                        </div>
                        <div className="mt-1 text-sm opacity-90 line-clamp-2">
                          {c.text}
                        </div>
                        <div className="mt-2 text-xs opacity-60">
                          group:{" "}
                          <span className="opacity-90">
                            {mapped?.canonicalGroupKey ?? `lk:${c.lineKey}`}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs opacity-60">
                        {isSel ? "Selected" : ""}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-3 text-xs opacity-60">
            Note: mapping doesn’t move comments yet; it only changes how lineKey
            resolves to the canonical thread.
          </div>
        </div>
      </div>
    </div>
  );
}
