"use client";

import React from "react";

type CommentStatus = "live" | "hidden" | "deleted";
type ModerationView = "comments" | "threads" | "reports";
type TimeWindow = "24h" | "7d" | "all";
type StatusFilter = CommentStatus | "all";

type CommentRow = {
  id: string;
  recordingId: string;
  groupKey: string;
  lineKey: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  bodyPlain: string;
  lineTextSnapshot: string;
  createdByMemberId: string;
  authorDisplayName: string;
  authorIsAdmin: boolean;
  status: CommentStatus;
  createdAt: string;
  editedAt: string | null;
  voteCount: number;
  reportCount: number;
  pinned: boolean;
  threadLocked: boolean;
};

type ThreadRow = {
  recordingId: string;
  groupKey: string;
  locked: boolean;
  pinnedCommentId: string | null;
  commentCount: number;
  lastActivityAt: string;
  updatedAt: string;
  lineKey: string | null;
  lineTextSnapshot: string | null;
  latestCommentPreview: string | null;
};

type ReportRow = {
  reportId: string;
  createdAt: string;
  category: string;
  reason: string;

  commentId: string;
  commentStatus: CommentStatus;
  recordingId: string;
  groupKey: string;
  lineKey: string;
  lineTextSnapshot: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  bodyPlain: string;
  commentCreatedAt: string;
  createdByMemberId: string;
  authorDisplayName: string;
  authorIsAdmin: boolean;
  pinned: boolean;
  threadLocked: boolean;
};

type TrackMeta = {
  recordingId: string;
  displayId: string;
  title: string | null;
  artist: string | null;
  albumTitle: string | null;
  albumSlug: string | null;
  trackNo: number | null;
};

type CatalogueOk = {
  ok: true;
  albums: Array<{
    albumId: string;
    albumSlug: string | null;
    albumTitle: string | null;
    tracks?: Array<{
      recordingId: string;
      displayId: string;
      title: string | null;
      artist: string | null;
      trackNo?: number | null;
    }>;
  }>;
};

type ApiErr = {
  ok: false;
  error: string;
};

type CommentsResponse =
  | { ok: true; comments: CommentRow[] }
  | ApiErr;

type ThreadsResponse =
  | { ok: true; threads: ThreadRow[] }
  | ApiErr;

type ReportsResponse =
  | { ok: true; reports: ReportRow[] }
  | ApiErr;

type CatalogueResponse = CatalogueOk | ApiErr;

type DeleteOk = {
  ok: true;
  requestedCount: number;
  foundCount: number;
  affectedCount: number;
  deletedCount: number;
  threadCount: number;
};

const BUTTON_CLASS =
  "rounded-md bg-white/[0.06] px-3 py-2 text-xs font-medium text-white/75 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-35";

const DANGER_BUTTON_CLASS =
  "rounded-md bg-red-400/[0.08] px-3 py-2 text-xs font-medium text-red-100/75 transition hover:bg-red-400/[0.14] hover:text-red-50 disabled:cursor-not-allowed disabled:opacity-35";

function isApiErr(value: unknown): value is ApiErr {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;
  return record.ok === false && typeof record.error === "string";
}

function isDeleteOk(value: unknown): value is DeleteOk {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;

  return (
    record.ok === true &&
    typeof record.deletedCount === "number" &&
    typeof record.affectedCount === "number"
  );
}

function fmtTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;

  return new Date(parsed).toLocaleString();
}

function fmtAge(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;

  const deltaMs = Date.now() - parsed;
  const minutes = Math.max(0, Math.floor(deltaMs / 60_000));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;

  return new Date(parsed).toLocaleDateString();
}

function deriveLineKeyFromGroupKey(groupKey: string): string {
  const value = groupKey.trim();
  if (!value.startsWith("lk:")) return "";

  return value.slice(3).trim();
}

function threadKey(recordingId: string, groupKey: string): string {
  return `${recordingId}::${groupKey}`;
}

function buildTrackMeta(
  catalogue: CatalogueOk,
): Record<string, TrackMeta> {
  const out: Record<string, TrackMeta> = {};

  for (const album of catalogue.albums ?? []) {
    for (const track of album.tracks ?? []) {
      const recordingId = track.recordingId.trim();
      if (!recordingId) continue;

      out[recordingId] = {
        recordingId,
        displayId: track.displayId.trim(),
        title: track.title,
        artist: track.artist,
        albumTitle: album.albumTitle,
        albumSlug: album.albumSlug,
        trackNo:
          typeof track.trackNo === "number"
            ? track.trackNo
            : null,
      };
    }
  }

  return out;
}

function trackTitle(
  recordingId: string,
  trackMeta: Record<string, TrackMeta>,
): string {
  const meta = trackMeta[recordingId];

  if (!meta) return recordingId;

  const title = meta.title?.trim() || meta.displayId || recordingId;

  return meta.trackNo ? `${meta.trackNo}. ${title}` : title;
}

function trackSubtitle(
  recordingId: string,
  trackMeta: Record<string, TrackMeta>,
): string | null {
  const meta = trackMeta[recordingId];
  if (!meta) return null;

  const parts = [meta.albumTitle, meta.artist]
    .map((value) => value?.trim() || "")
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}

function displayIdForRecording(
  recordingId: string,
  trackMeta: Record<string, TrackMeta>,
): string {
  return (
    trackMeta[recordingId]?.displayId?.trim() ||
    recordingId
  );
}

function commentHref(
  row: Pick<
    CommentRow,
    "recordingId" | "lineKey" | "id" | "rootId"
  >,
  trackMeta: Record<string, TrackMeta>,
): string {
  const displayId = displayIdForRecording(
    row.recordingId,
    trackMeta,
  );

  const hash = new URLSearchParams();
  hash.set("l", row.lineKey);
  hash.set("c", row.id);
  hash.set("root", row.rootId);

  return `/exegesis/${encodeURIComponent(displayId)}#${hash.toString()}`;
}

function reportHref(
  row: ReportRow,
  trackMeta: Record<string, TrackMeta>,
): string {
  const displayId = displayIdForRecording(
    row.recordingId,
    trackMeta,
  );

  const hash = new URLSearchParams();
  hash.set("l", row.lineKey);
  hash.set("c", row.commentId);
  hash.set("root", row.rootId);

  return `/exegesis/${encodeURIComponent(displayId)}#${hash.toString()}`;
}

function threadHref(
  row: ThreadRow,
  trackMeta: Record<string, TrackMeta>,
): string {
  const displayId = displayIdForRecording(
    row.recordingId,
    trackMeta,
  );

  const lineKey =
    row.lineKey ||
    deriveLineKeyFromGroupKey(row.groupKey);

  if (!lineKey) {
    return `/exegesis/${encodeURIComponent(displayId)}`;
  }

  return (
    `/exegesis/${encodeURIComponent(displayId)}` +
    `#l=${encodeURIComponent(lineKey)}`
  );
}

function statusPillClass(status: CommentStatus): string {
  if (status === "live") {
    return "bg-emerald-300/[0.1] text-emerald-100/80";
  }

  if (status === "hidden") {
    return "bg-amber-300/[0.1] text-amber-100/80";
  }

  return "bg-white/[0.06] text-white/45";
}

function StatusPill(
  props: Readonly<{ status: CommentStatus }>,
) {
  const className = statusPillClass(props.status);

  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${className}`}
    >
      {props.status}
    </span>
  );
}

function MetaPill(
  props: Readonly<{ children: React.ReactNode }>,
) {
  return (
    <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-white/55">
      {props.children}
    </span>
  );
}

function ViewButton(
  props: Readonly<{
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
  }>,
) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
        props.active
          ? "bg-white/[0.14] text-white"
          : "bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white/80",
      ].join(" ")}
    >
      {props.children}
    </button>
  );
}

function TechnicalDetails(
  props: Readonly<{
    rows: Array<readonly [string, string | number | null]>;
  }>,
) {
  return (
    <details className="mt-3 text-[11px] text-white/35">
      <summary className="cursor-pointer select-none hover:text-white/55">
        Technical details
      </summary>

      <div className="mt-2 space-y-1 font-mono">
        {props.rows.map(([label, value]) => (
          <div
            key={label}
            className="break-all"
          >
            <span className="text-white/25">{label}:</span>{" "}
            {value ?? "—"}
          </div>
        ))}
      </div>
    </details>
  );
}

type CommentCardProps = Readonly<{
  row: CommentRow;
  trackMeta: Record<string, TrackMeta>;
  selected: boolean;
  disabled: boolean;
  onToggleSelected: (commentId: string) => void;
  onHide: (
    commentId: string,
    status: "live" | "hidden",
  ) => Promise<void>;
  onDelete: (commentIds: string[]) => Promise<void>;
  onPin: (
    recordingId: string,
    groupKey: string,
    pinnedCommentId: string | null,
  ) => Promise<void>;
}>;

function CommentCard(props: CommentCardProps) {
  const { row } = props;
  const subtitle = trackSubtitle(row.recordingId, props.trackMeta);
  const isRoot = row.parentId === null;

  return (
    <article className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label={`Select comment by ${row.authorDisplayName}`}
          checked={props.selected}
          disabled={props.disabled || row.status === "deleted"}
          onChange={() => props.onToggleSelected(row.id)}
          className="mt-1 h-4 w-4 shrink-0"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white/90">
              {row.authorDisplayName}
            </span>

            {row.authorIsAdmin ? <MetaPill>Admin</MetaPill> : null}

            <span
              className="text-xs text-white/40"
              title={fmtTime(row.createdAt)}
            >
              {fmtAge(row.createdAt)}
            </span>

            {row.editedAt ? (
              <span className="text-xs text-white/30">edited</span>
            ) : null}

            <StatusPill status={row.status} />

            {row.pinned ? <MetaPill>Pinned</MetaPill> : null}
            {row.threadLocked ? <MetaPill>Thread locked</MetaPill> : null}
            {row.reportCount > 0 ? (
              <MetaPill>
                {row.reportCount} {row.reportCount === 1 ? "report" : "reports"}
              </MetaPill>
            ) : null}
          </div>

          <div className="mt-3">
            <div className="text-sm font-semibold text-white/80">
              {trackTitle(row.recordingId, props.trackMeta)}
            </div>

            {subtitle ? (
              <div className="mt-0.5 text-xs text-white/35">
                {subtitle}
              </div>
            ) : null}
          </div>

          {row.lineTextSnapshot ? (
            <blockquote className="mt-3 border-l-2 border-white/15 pl-3 text-sm italic text-white/50">
              {row.lineTextSnapshot}
            </blockquote>
          ) : null}

          <div className="mt-4 whitespace-pre-wrap text-[15px] leading-6 text-white/85">
            {row.bodyPlain || (
              <span className="italic text-white/35">
                Deleted comment
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/35">
            <span>{isRoot ? "Root comment" : `Reply · depth ${row.depth}`}</span>
            <span>·</span>
            <span>
              {row.voteCount} {row.voteCount === 1 ? "vote" : "votes"}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={commentHref(row, props.trackMeta)}
              target="_blank"
              rel="noreferrer"
              className={BUTTON_CLASS}
            >
              Open comment
            </a>

            {row.status === "live" ? (
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={props.disabled}
                onClick={() => {
                  void props.onHide(row.id, "hidden");
                }}
              >
                Hide
              </button>
            ) : null}

            {row.status === "hidden" ? (
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={props.disabled}
                onClick={() => {
                  void props.onHide(row.id, "live");
                }}
              >
                Unhide
              </button>
            ) : null}

            {isRoot && row.status !== "deleted" ? (
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={props.disabled}
                onClick={() => {
                  void props.onPin(
                    row.recordingId,
                    row.groupKey,
                    row.pinned ? null : row.id,
                  );
                }}
              >
                {row.pinned ? "Unpin" : "Pin thread"}
              </button>
            ) : null}

            {row.status !== "deleted" ? (
              <button
                type="button"
                className={DANGER_BUTTON_CLASS}
                disabled={props.disabled}
                onClick={() => {
                  void props.onDelete([row.id]);
                }}
              >
                Delete
              </button>
            ) : null}
          </div>

          <TechnicalDetails
            rows={[
              ["comment", row.id],
              ["member", row.createdByMemberId],
              ["recording", row.recordingId],
              ["group", row.groupKey],
              ["line", row.lineKey],
              ["root", row.rootId],
              ["parent", row.parentId],
            ]}
          />
        </div>
      </div>
    </article>
  );
}

type ThreadCardProps = Readonly<{
  row: ThreadRow;
  trackMeta: Record<string, TrackMeta>;
  disabled: boolean;
  onLock: (
    recordingId: string,
    groupKey: string,
    locked: boolean,
  ) => Promise<void>;
  onPin: (
    recordingId: string,
    groupKey: string,
    pinnedCommentId: string | null,
  ) => Promise<void>;
}>;

function ThreadCard(props: ThreadCardProps) {
  const { row } = props;
  const subtitle = trackSubtitle(row.recordingId, props.trackMeta);

  return (
    <article className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">
            {trackTitle(row.recordingId, props.trackMeta)}
          </div>

          {subtitle ? (
            <div className="mt-0.5 text-xs text-white/35">
              {subtitle}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <MetaPill>
            {row.commentCount}{" "}
            {row.commentCount === 1 ? "comment" : "comments"}
          </MetaPill>
          {row.locked ? <MetaPill>Locked</MetaPill> : null}
          {row.pinnedCommentId ? <MetaPill>Pinned</MetaPill> : null}
        </div>
      </div>

      {row.lineTextSnapshot ? (
        <blockquote className="mt-3 border-l-2 border-white/15 pl-3 text-sm italic text-white/50">
          {row.lineTextSnapshot}
        </blockquote>
      ) : null}

      {row.latestCommentPreview ? (
        <div className="mt-3 text-sm leading-6 text-white/65">
          {row.latestCommentPreview}
        </div>
      ) : (
        <div className="mt-3 text-sm text-white/35">
          No visible comments remain in this thread.
        </div>
      )}

      <div className="mt-3 text-xs text-white/30">
        Last activity {fmtAge(row.lastActivityAt)}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={threadHref(row, props.trackMeta)}
          target="_blank"
          rel="noreferrer"
          className={BUTTON_CLASS}
        >
          Open thread
        </a>

        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={props.disabled}
          onClick={() => {
            void props.onLock(
              row.recordingId,
              row.groupKey,
              !row.locked,
            );
          }}
        >
          {row.locked ? "Unlock thread" : "Lock thread"}
        </button>

        {row.pinnedCommentId ? (
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={props.disabled}
            onClick={() => {
              void props.onPin(
                row.recordingId,
                row.groupKey,
                null,
              );
            }}
          >
            Unpin
          </button>
        ) : null}
      </div>

      {!row.pinnedCommentId && row.commentCount > 0 ? (
        <div className="mt-3 text-xs text-white/30">
          Pin a root comment from the Comments view.
        </div>
      ) : null}

      <TechnicalDetails
        rows={[
          ["recording", row.recordingId],
          ["group", row.groupKey],
          ["line", row.lineKey],
          ["pinned comment", row.pinnedCommentId],
        ]}
      />
    </article>
  );
}

type ReportCardProps = Readonly<{
  row: ReportRow;
  trackMeta: Record<string, TrackMeta>;
  disabled: boolean;
  onHide: (
    commentId: string,
    status: "live" | "hidden",
  ) => Promise<void>;
  onDelete: (commentIds: string[]) => Promise<void>;
  onPin: (
    recordingId: string,
    groupKey: string,
    pinnedCommentId: string | null,
  ) => Promise<void>;
}>;

function ReportCard(props: ReportCardProps) {
  const { row } = props;
  const subtitle = trackSubtitle(row.recordingId, props.trackMeta);
  const isRoot = row.parentId === null;

  return (
    <article className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-white/90">
          {row.authorDisplayName}
        </span>

        {row.authorIsAdmin ? <MetaPill>Admin</MetaPill> : null}

        <StatusPill status={row.commentStatus} />

        {row.pinned ? <MetaPill>Pinned</MetaPill> : null}
        {row.threadLocked ? <MetaPill>Thread locked</MetaPill> : null}

        <span
          className="text-xs text-white/35"
          title={fmtTime(row.createdAt)}
        >
          Reported {fmtAge(row.createdAt)}
        </span>
      </div>

      <div className="mt-3">
        <div className="text-sm font-semibold text-white/80">
          {trackTitle(row.recordingId, props.trackMeta)}
        </div>

        {subtitle ? (
          <div className="mt-0.5 text-xs text-white/35">
            {subtitle}
          </div>
        ) : null}
      </div>

      {row.lineTextSnapshot ? (
        <blockquote className="mt-3 border-l-2 border-white/15 pl-3 text-sm italic text-white/50">
          {row.lineTextSnapshot}
        </blockquote>
      ) : null}

      <div className="mt-4 whitespace-pre-wrap text-[15px] leading-6 text-white/80">
        {row.bodyPlain}
      </div>

      <div className="mt-4 rounded-lg bg-white/[0.04] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          Report · {row.category}
        </div>
        <div className="mt-2 text-sm leading-6 text-white/65">
          {row.reason || "No additional reason supplied."}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={reportHref(row, props.trackMeta)}
          target="_blank"
          rel="noreferrer"
          className={BUTTON_CLASS}
        >
          Open comment
        </a>

        {row.commentStatus === "live" ? (
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={props.disabled}
            onClick={() => {
              void props.onHide(row.commentId, "hidden");
            }}
          >
            Hide
          </button>
        ) : null}

        {row.commentStatus === "hidden" ? (
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={props.disabled}
            onClick={() => {
              void props.onHide(row.commentId, "live");
            }}
          >
            Unhide
          </button>
        ) : null}

        {isRoot && row.commentStatus !== "deleted" ? (
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={props.disabled}
            onClick={() => {
              void props.onPin(
                row.recordingId,
                row.groupKey,
                row.pinned ? null : row.commentId,
              );
            }}
          >
            {row.pinned ? "Unpin" : "Pin thread"}
          </button>
        ) : null}

        {row.commentStatus !== "deleted" ? (
          <button
            type="button"
            className={DANGER_BUTTON_CLASS}
            disabled={props.disabled}
            onClick={() => {
              void props.onDelete([row.commentId]);
            }}
          >
            Delete
          </button>
        ) : null}
      </div>

      <TechnicalDetails
        rows={[
          ["report", row.reportId],
          ["comment", row.commentId],
          ["member", row.createdByMemberId],
          ["recording", row.recordingId],
          ["group", row.groupKey],
          ["line", row.lineKey],
          ["root", row.rootId],
          ["parent", row.parentId],
        ]}
      />
    </article>
  );
}

async function postAdmin(
  url: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok || isApiErr(payload)) {
    throw new Error(
      isApiErr(payload)
        ? payload.error
        : `Admin request failed (${response.status}).`,
    );
  }

  return payload;
}

export default function ExegesisModerator() {
  const [view, setView] =
    React.useState<ModerationView>("comments");

  const [busy, setBusy] = React.useState(false);
  const [mutationBusy, setMutationBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const [comments, setComments] = React.useState<CommentRow[]>([]);
  const [threads, setThreads] = React.useState<ThreadRow[]>([]);
  const [reports, setReports] = React.useState<ReportRow[]>([]);

  const [trackMeta, setTrackMeta] = React.useState<
    Record<string, TrackMeta>
  >({});

  const [limit, setLimit] = React.useState(100);
  const [timeWindow, setTimeWindow] =
    React.useState<TimeWindow>("24h");
  const [statusFilter, setStatusFilter] =
    React.useState<StatusFilter>("all");
  const [trackFilter, setTrackFilter] = React.useState("");
  const [search, setSearch] = React.useState("");

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set<string>(),
  );

  const refresh = React.useCallback(async () => {
    setErr("");
    setBusy(true);

    try {
      const commentParams = new URLSearchParams({
        limit: String(limit),
        window: timeWindow,
        status: statusFilter,
      });

      const standardParams = new URLSearchParams({
        limit: String(limit),
      });

      const [
        commentsResponse,
        threadsResponse,
        reportsResponse,
        catalogueResponse,
      ] = await Promise.all([
        fetch(
          `/api/admin/exegesis/comments?${commentParams.toString()}`,
          { cache: "no-store" },
        ),
        fetch(
          `/api/admin/exegesis/threads?${standardParams.toString()}`,
          { cache: "no-store" },
        ),
        fetch(
          `/api/admin/exegesis/reports?${standardParams.toString()}`,
          { cache: "no-store" },
        ),
        fetch("/api/lyrics/catalogue", {
          cache: "no-store",
        }),
      ]);

      const [
        commentsPayload,
        threadsPayload,
        reportsPayload,
        cataloguePayload,
      ] = await Promise.all([
        commentsResponse.json() as Promise<CommentsResponse>,
        threadsResponse.json() as Promise<ThreadsResponse>,
        reportsResponse.json() as Promise<ReportsResponse>,
        catalogueResponse.json() as Promise<CatalogueResponse>,
      ]);

      if (!commentsPayload.ok) {
        throw new Error(
          commentsPayload.error || "Failed to load comments.",
        );
      }

      if (!threadsPayload.ok) {
        throw new Error(
          threadsPayload.error || "Failed to load threads.",
        );
      }

      if (!reportsPayload.ok) {
        throw new Error(
          reportsPayload.error || "Failed to load reports.",
        );
      }

      setComments(commentsPayload.comments ?? []);
      setThreads(threadsPayload.threads ?? []);
      setReports(reportsPayload.reports ?? []);

      if (catalogueResponse.ok && cataloguePayload.ok) {
        setTrackMeta(buildTrackMeta(cataloguePayload));
      } else {
        setTrackMeta({});
      }

      setSelectedIds(new Set<string>());
    } catch (error: unknown) {
      setErr(
        error instanceof Error
          ? error.message
          : "Failed to load moderation data.",
      );
    } finally {
      setBusy(false);
    }
  }, [limit, statusFilter, timeWindow]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    setSelectedIds(new Set<string>());
  }, [search, trackFilter]);

  const trackOptions = React.useMemo(() => {
    return Object.values(trackMeta).sort((a, b) => {
      const albumCompare = (a.albumTitle ?? "").localeCompare(
        b.albumTitle ?? "",
      );

      if (albumCompare !== 0) return albumCompare;

      const aNo = a.trackNo ?? Number.MAX_SAFE_INTEGER;
      const bNo = b.trackNo ?? Number.MAX_SAFE_INTEGER;

      if (aNo !== bNo) return aNo - bNo;

      return (a.title ?? a.recordingId).localeCompare(
        b.title ?? b.recordingId,
      );
    });
  }, [trackMeta]);

  const visibleComments = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return comments.filter((row) => {
      if (trackFilter && row.recordingId !== trackFilter) {
        return false;
      }

      if (!query) return true;

      const haystack = [
        row.authorDisplayName,
        row.bodyPlain,
        row.lineTextSnapshot,
        trackTitle(row.recordingId, trackMeta),
        trackSubtitle(row.recordingId, trackMeta) ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [comments, search, trackFilter, trackMeta]);

  const selectableVisibleComments = React.useMemo(
    () => visibleComments.filter((row) => row.status !== "deleted"),
    [visibleComments],
  );

  const allVisibleSelected =
    selectableVisibleComments.length > 0 &&
    selectableVisibleComments.every((row) => selectedIds.has(row.id));

  const actionDisabled = busy || mutationBusy;

  async function runMutation(
    operation: () => Promise<string | null>,
  ): Promise<void> {
    setErr("");
    setNotice("");
    setMutationBusy(true);

    try {
      const message = await operation();
      await refresh();

      if (message) {
        setNotice(message);
      }
    } catch (error: unknown) {
      setErr(
        error instanceof Error
          ? error.message
          : "Moderation update failed.",
      );
    } finally {
      setMutationBusy(false);
    }
  }

  async function setLocked(
    recordingId: string,
    groupKey: string,
    locked: boolean,
  ): Promise<void> {
    await runMutation(async () => {
      await postAdmin("/api/admin/exegesis/thread/lock", {
        recordingId,
        groupKey,
        locked,
      });

      return locked ? "Thread locked." : "Thread unlocked.";
    });
  }

  async function setPinned(
    recordingId: string,
    groupKey: string,
    pinnedCommentId: string | null,
  ): Promise<void> {
    await runMutation(async () => {
      await postAdmin("/api/admin/exegesis/thread/pin", {
        recordingId,
        groupKey,
        pinnedCommentId,
      });

      return pinnedCommentId
        ? "Root comment pinned."
        : "Thread unpinned.";
    });
  }

  async function setCommentHidden(
    commentId: string,
    nextStatus: "live" | "hidden",
  ): Promise<void> {
    await runMutation(async () => {
      await postAdmin("/api/admin/exegesis/comment/hide", {
        commentId,
        nextStatus,
      });

      return nextStatus === "hidden"
        ? "Comment hidden."
        : "Comment restored to public view.";
    });
  }

  async function deleteComments(commentIds: string[]): Promise<void> {
    const uniqueIds = Array.from(
      new Set(commentIds.map((id) => id.trim()).filter(Boolean)),
    );

    if (uniqueIds.length === 0) return;

    const prompt =
      uniqueIds.length === 1
        ? "Delete this comment? Any replies beneath it will also be deleted. This is a terminal moderation action."
        : `Delete these ${uniqueIds.length} selected comments? Any replies beneath them will also be deleted. This is a terminal moderation action.`;

    if (!globalThis.window.confirm(prompt)) return;

    await runMutation(async () => {
      const payload = await postAdmin(
        "/api/admin/exegesis/comment/delete",
        {
          commentIds: uniqueIds,
        },
      );

      if (!isDeleteOk(payload)) {
        throw new Error("Delete succeeded with an unexpected response.");
      }

      const count = payload.deletedCount;
      const subtreeExtra = Math.max(
        0,
        payload.affectedCount - uniqueIds.length,
      );

      if (subtreeExtra > 0) {
        return `Deleted ${count} comments, including ${subtreeExtra} descendant replies.`;
      }

      return `Deleted ${count} ${count === 1 ? "comment" : "comments"}.`;
    });
  }

  function toggleSelected(commentId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }

      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        for (const row of selectableVisibleComments) {
          next.delete(row.id);
        }
      } else {
        for (const row of selectableVisibleComments) {
          next.add(row.id);
        }
      }

      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <ViewButton
            active={view === "comments"}
            onClick={() => setView("comments")}
          >
            Comments · {comments.length}
          </ViewButton>

          <ViewButton
            active={view === "threads"}
            onClick={() => setView("threads")}
          >
            Threads · {threads.length}
          </ViewButton>

          <ViewButton
            active={view === "reports"}
            onClick={() => setView("reports")}
          >
            Reports · {reports.length}
          </ViewButton>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(event) => {
              setLimit(Number(event.target.value));
            }}
            className="rounded-md border border-white/[0.06] bg-white/[0.06] px-3 py-2 text-sm text-white/75 outline-none"
          >
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
            <option value={200}>200 rows</option>
          </select>

          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={actionDisabled}
            onClick={() => {
              void refresh();
            }}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-lg border border-red-300/10 bg-red-300/[0.06] p-3 text-sm text-red-100/80">
          {err}
        </div>
      ) : null}

      {notice ? (
        <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.05] p-3 text-sm text-white/70">
          {notice}
        </div>
      ) : null}

      {view === "comments" ? (
        <section className="mt-6">
          <div className="rounded-xl bg-white/[0.04] p-4">
            <div className="flex flex-wrap gap-3">
              <select
                value={timeWindow}
                onChange={(event) => {
                  setTimeWindow(event.target.value as TimeWindow);
                }}
                className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-sm text-white/75 outline-none"
              >
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="all">All time</option>
              </select>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StatusFilter);
                }}
                className="rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-sm text-white/75 outline-none"
              >
                <option value="all">All statuses</option>
                <option value="live">Live</option>
                <option value="hidden">Hidden</option>
                <option value="deleted">Deleted</option>
              </select>

              <select
                value={trackFilter}
                onChange={(event) => {
                  setTrackFilter(event.target.value);
                }}
                className="min-w-[220px] rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-sm text-white/75 outline-none"
              >
                <option value="">All tracks</option>

                {trackOptions.map((track) => (
                  <option
                    key={track.recordingId}
                    value={track.recordingId}
                  >
                    {track.albumTitle
                      ? `${track.albumTitle} · `
                      : ""}
                    {track.trackNo ? `${track.trackNo}. ` : ""}
                    {track.title ?? track.displayId}
                  </option>
                ))}
              </select>

              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Search author or comment"
                className="min-w-[240px] flex-1 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-sm text-white/80 outline-none placeholder:text-white/30"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-white/55">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={
                    actionDisabled ||
                    selectableVisibleComments.length === 0
                  }
                  onChange={toggleAllVisible}
                  className="h-4 w-4"
                />
                <span>Select visible</span>
              </label>

              <div className="flex items-center gap-3">
                <span className="text-xs text-white/35">
                  {visibleComments.length} shown
                  {selectedIds.size > 0
                    ? ` · ${selectedIds.size} selected`
                    : ""}
                </span>

                {selectedIds.size > 0 ? (
                  <button
                    type="button"
                    className={DANGER_BUTTON_CLASS}
                    disabled={actionDisabled}
                    onClick={() => {
                      void deleteComments(Array.from(selectedIds));
                    }}
                  >
                    Delete selected
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {visibleComments.length === 0 ? (
              <div className="rounded-xl bg-white/[0.04] p-6 text-sm text-white/40">
                No comments match these filters.
              </div>
            ) : (
              visibleComments.map((row) => (
                <CommentCard
                  key={row.id}
                  row={row}
                  trackMeta={trackMeta}
                  selected={selectedIds.has(row.id)}
                  disabled={actionDisabled}
                  onToggleSelected={toggleSelected}
                  onHide={setCommentHidden}
                  onDelete={deleteComments}
                  onPin={setPinned}
                />
              ))
            )}
          </div>
        </section>
      ) : null}

      {view === "threads" ? (
        <section className="mt-6">
          <div className="mb-4 text-sm text-white/45">
            Thread controls govern the whole lyric discussion. Pin a specific
            root comment from the Comments view.
          </div>

          <div className="space-y-3">
            {threads.length === 0 ? (
              <div className="rounded-xl bg-white/[0.04] p-6 text-sm text-white/40">
                No thread metadata rows yet.
              </div>
            ) : (
              threads.map((row) => (
                <ThreadCard
                  key={threadKey(row.recordingId, row.groupKey)}
                  row={row}
                  trackMeta={trackMeta}
                  disabled={actionDisabled}
                  onLock={setLocked}
                  onPin={setPinned}
                />
              ))
            )}
          </div>
        </section>
      ) : null}

      {view === "reports" ? (
        <section className="mt-6">
          <div className="mb-4 text-sm text-white/45">
            Reports remain as an audit queue. Formal report resolution and
            dismissal state can be added later without conflating it with
            comment moderation.
          </div>

          <div className="space-y-3">
            {reports.length === 0 ? (
              <div className="rounded-xl bg-white/[0.04] p-6 text-sm text-white/40">
                No reports yet.
              </div>
            ) : (
              reports.map((row) => (
                <ReportCard
                  key={row.reportId}
                  row={row}
                  trackMeta={trackMeta}
                  disabled={actionDisabled}
                  onHide={setCommentHidden}
                  onDelete={deleteComments}
                  onPin={setPinned}
                />
              ))
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
