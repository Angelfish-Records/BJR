// web/app/admin/mailbag/MailbagDashboardClient.tsx
"use client";

import React from "react";
import AdminPageFrame from "../AdminPageFrame";

type Status = "open" | "answered" | "discarded";
type Visibility = "public" | "friend" | "patron" | "partner";
type SubmissionKind = "question" | "suggestion" | "bug_report";
type KindFilter = SubmissionKind | "all";

type Row = {
  id: string;
  member_id: string;
  member_email: string | null;
  question_text: string;
  asker_name: string | null;
  kind: SubmissionKind;
  status: Status;
  created_at: string;
  updated_at: string;
  answered_at: string | null;
  answer_post_slug: string | null;
  notify_email_sent_at: string | null;
  admin_reply_sent_at: string | null;
};

type ListResponse = {
  ok: boolean;
  items: Row[];
  nextCursor: string | null;
};

type PublishOk = {
  ok: true;
  mode: "published_post" | "private_reply";
  kind: SubmissionKind;
  post?: { id: string; slug: string; url: string };
  notified?: { attempted: number; sent: number };
};

type PublishErr = { ok: false; code?: string };

type PublishResponse = PublishOk | PublishErr;

type PublishPayload = {
  ids: string[];
  title: string;
  answerText: string;
  visibility: Visibility;
  pinned: boolean;
};

type SelectionSummary = {
  selectedCount: number;
  selectedKind: SubmissionKind | null;
  mixedSelectedKinds: boolean;
  privateReplySelectionInvalid: boolean;
  canAnswer: boolean;
  isQuestionMode: boolean;
  isPrivateReplyMode: boolean;
};

type PublishNotice = {
  publishedSlug: string | null;
  replyNotice: string | null;
};

const STATUSES: readonly Status[] = ["open", "answered", "discarded"];
const KIND_FILTERS: readonly KindFilter[] = [
  "all",
  "question",
  "suggestion",
  "bug_report",
];

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function kindLabel(kind: SubmissionKind): string {
  if (kind === "suggestion") return "suggestion";
  if (kind === "bug_report") return "bug report";
  return "question";
}

function kindFilterLabel(kind: KindFilter): string {
  if (kind === "all") return "all";
  if (kind === "bug_report") return "bug reports";
  return `${kind}s`;
}

function isPublishResponse(value: unknown): value is PublishResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  if (typeof response.ok !== "boolean") return false;

  if (response.ok === true) {
    if (
      response.mode !== "published_post" &&
      response.mode !== "private_reply"
    ) {
      return false;
    }

    return (
      response.kind === "question" ||
      response.kind === "suggestion" ||
      response.kind === "bug_report"
    );
  }

  return true;
}

function badgeStyle(kind: SubmissionKind): React.CSSProperties {
  if (kind === "suggestion") {
    return {
      border: "1px solid rgba(120,200,255,0.22)",
      background: "rgba(80,140,220,0.14)",
      color: "rgba(220,235,255,0.95)",
    };
  }

  if (kind === "bug_report") {
    return {
      border: "1px solid rgba(255,140,140,0.22)",
      background: "rgba(180,50,50,0.16)",
      color: "rgba(255,225,225,0.95)",
    };
  }

  return {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
  };
}

function getSelectionSummary(
  items: Row[],
  selected: Set<string>,
  status: Status,
): SelectionSummary {
  const selectedItems = items.filter((item) => selected.has(item.id));
  const selectedKinds = Array.from(
    new Set(selectedItems.map((item) => item.kind)),
  );
  const selectedKind =
    selectedKinds.length === 1 ? (selectedKinds[0] ?? null) : null;
  const selectedCount = selected.size;
  const mixedSelectedKinds = selectedKinds.length > 1;
  const privateReplySelectionInvalid =
    selectedKind !== null && selectedKind !== "question" && selectedCount !== 1;

  return {
    selectedCount,
    selectedKind,
    mixedSelectedKinds,
    privateReplySelectionInvalid,
    canAnswer:
      status === "open" &&
      selectedCount > 0 &&
      !mixedSelectedKinds &&
      !privateReplySelectionInvalid,
    isQuestionMode: selectedKind === "question",
    isPrivateReplyMode:
      selectedKind === "suggestion" || selectedKind === "bug_report",
  };
}

function answerToggleLabel(
  answerOpen: boolean,
  isPrivateReplyMode: boolean,
): string {
  if (answerOpen) return "Close editor";
  if (isPrivateReplyMode) return "Reply to selected";
  return "Answer selected";
}

function editorTitle(isPrivateReplyMode: boolean): string {
  return isPrivateReplyMode ? "Send private reply" : "Publish Q&A post";
}

function editorDescription(isPrivateReplyMode: boolean): string {
  if (isPrivateReplyMode) {
    return "This reply is emailed to the submitter and stored on the row. No public post will be created.";
  }

  return "Selected questions will be inserted above your answer automatically.";
}

function answerFieldLabel(isPrivateReplyMode: boolean): string {
  return isPrivateReplyMode ? "Reply" : "Answer";
}

function answerPlaceholder(isPrivateReplyMode: boolean): string {
  if (isPrivateReplyMode) return "Write your reply to this member.";
  return "Write your answer. (Blank lines become paragraph breaks.)";
}

function publishButtonLabel(
  publishing: boolean,
  isPrivateReplyMode: boolean,
): string {
  if (publishing) {
    return isPrivateReplyMode ? "Sending…" : "Publishing…";
  }

  return isPrivateReplyMode ? "Send reply" : "Publish post";
}

function publishErrorCode(data: PublishResponse | null): string {
  if (data?.ok !== false) return "";
  return typeof data.code === "string" ? data.code : "";
}

function publishFailureMessage(
  response: Response,
  data: PublishResponse | null,
): string {
  const code = publishErrorCode(data);
  if (code) return `Publish failed (${code})`;
  return `Publish failed (${response.status})`;
}

function buildReplyNotice(data: PublishOk): string {
  const base = `Reply sent for ${kindLabel(data.kind)}`;

  if (!data.notified) return `${base}.`;

  const delivery = ` (${data.notified.sent}/${data.notified.attempted} delivered)`;
  return `${base}${delivery}.`;
}

function getPublishNotice(data: PublishOk): PublishNotice {
  if (data.mode === "published_post" && data.post?.slug) {
    return {
      publishedSlug: data.post.slug,
      replyNotice: null,
    };
  }

  return {
    publishedSlug: null,
    replyNotice: buildReplyNotice(data),
  };
}

async function requestMailbagPage(params: {
  status: Status;
  kind: KindFilter;
  cursor: string | null;
  reset: boolean;
}): Promise<ListResponse> {
  const { status, kind, cursor, reset } = params;
  const url = new URL("/api/admin/mailbag/questions", window.location.origin);
  url.searchParams.set("status", status);
  url.searchParams.set("kind", kind);
  url.searchParams.set("limit", "60");

  if (!reset && cursor) url.searchParams.set("cursor", cursor);

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) throw new Error(`Fetch failed (${response.status})`);

  const data = (await response.json()) as ListResponse;
  if (!data.ok) throw new Error("Bad response");
  return data;
}

async function requestDiscard(ids: string[]): Promise<void> {
  const response = await fetch("/api/admin/mailbag/questions/discard", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) throw new Error(`Discard failed (${response.status})`);

  const data = (await response.json()) as { ok: boolean; updated?: number };
  if (!data.ok) throw new Error("Discard failed");
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestPublish(payload: PublishPayload): Promise<PublishOk> {
  const response = await fetch("/api/admin/mailbag/questions/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = await readResponseJson(response);
  const data = isPublishResponse(raw) ? raw : null;

  if (response.ok && data?.ok === true) return data;
  throw new Error(publishFailureMessage(response, data));
}

type StatusActionsProps = Readonly<{
  status: Status;
  onChange: (status: Status) => void;
}>;

function StatusActions({ status, onChange }: StatusActionsProps) {
  return (
    <>
      {STATUSES.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background:
              status === value
                ? "rgba(255,255,255,0.10)"
                : "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.92)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            opacity: status === value ? 1 : 0.82,
          }}
        >
          {value}
        </button>
      ))}
    </>
  );
}

type KindFiltersProps = Readonly<{
  kind: KindFilter;
  onChange: (kind: KindFilter) => void;
}>;

function KindFilters({ kind, onChange }: KindFiltersProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {KIND_FILTERS.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          style={{
            height: 30,
            padding: "0 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background:
              kind === value
                ? "rgba(255,255,255,0.10)"
                : "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.92)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            opacity: kind === value ? 1 : 0.82,
          }}
        >
          {kindFilterLabel(value)}
        </button>
      ))}
    </div>
  );
}

type OpenSelectionActionsProps = Readonly<{
  status: Status;
  selectedCount: number;
  loading: boolean;
  canAnswer: boolean;
  answerOpen: boolean;
  isPrivateReplyMode: boolean;
  onDiscard: () => void;
  onToggleEditor: () => void;
}>;

function OpenSelectionActions({
  status,
  selectedCount,
  loading,
  canAnswer,
  answerOpen,
  isPrivateReplyMode,
  onDiscard,
  onToggleEditor,
}: OpenSelectionActionsProps) {
  if (status !== "open") return null;

  return (
    <>
      <button
        type="button"
        onClick={onDiscard}
        disabled={selectedCount === 0 || loading}
        style={{
          height: 30,
          padding: "0 12px",
          borderRadius: 10,
          border: "1px solid rgba(255,120,120,0.22)",
          background: "rgba(120,0,0,0.16)",
          color: "rgba(255,255,255,0.92)",
          cursor: selectedCount ? "pointer" : "default",
          fontSize: 12,
          fontWeight: 800,
          opacity: selectedCount ? 1 : 0.5,
        }}
      >
        Discard selected
      </button>

      <button
        type="button"
        onClick={onToggleEditor}
        disabled={!canAnswer || loading}
        style={{
          height: 30,
          padding: "0 12px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.10)",
          background: "rgba(0,0,0,0.04)",
          cursor: canAnswer ? "pointer" : "default",
          fontSize: 12,
          fontWeight: 800,
          opacity: canAnswer ? 1 : 0.5,
        }}
      >
        {answerToggleLabel(answerOpen, isPrivateReplyMode)}
      </button>
    </>
  );
}

type SelectionToolbarProps = Readonly<{
  itemCount: number;
  selection: SelectionSummary;
  status: Status;
  loading: boolean;
  answerOpen: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDiscard: () => void;
  onToggleEditor: () => void;
}>;

function SelectionToolbar({
  itemCount,
  selection,
  status,
  loading,
  answerOpen,
  onSelectAll,
  onClearSelection,
  onDiscard,
  onToggleEditor,
}: SelectionToolbarProps) {
  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        onClick={onSelectAll}
        disabled={itemCount === 0}
        style={{
          height: 30,
          padding: "0 10px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.92)",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        Select all visible
      </button>

      <button
        type="button"
        onClick={onClearSelection}
        disabled={selection.selectedCount === 0}
        style={{
          height: 30,
          padding: "0 10px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.92)",
          cursor: "pointer",
          fontSize: 12,
          opacity: selection.selectedCount ? 1 : 0.5,
        }}
      >
        Clear selection
      </button>

      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Selected: {selection.selectedCount}
      </div>

      {selection.selectedKind ? (
        <div
          style={{
            ...badgeStyle(selection.selectedKind),
            height: 24,
            padding: "0 8px",
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}
        >
          {kindLabel(selection.selectedKind)}
        </div>
      ) : null}

      {selection.mixedSelectedKinds ? (
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Mixed kinds cannot be answered together.
        </div>
      ) : null}

      {selection.privateReplySelectionInvalid ? (
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Suggestions and bug reports must be replied to one at a time.
        </div>
      ) : null}

      <OpenSelectionActions
        status={status}
        selectedCount={selection.selectedCount}
        loading={loading}
        canAnswer={selection.canAnswer}
        answerOpen={answerOpen}
        isPrivateReplyMode={selection.isPrivateReplyMode}
        onDiscard={onDiscard}
        onToggleEditor={onToggleEditor}
      />
    </div>
  );
}

type DashboardNoticesProps = Readonly<{
  lastPublishedSlug: string | null;
  lastReplyNotice: string | null;
  error: string | null;
}>;

function DashboardNotices({
  lastPublishedSlug,
  lastReplyNotice,
  error,
}: DashboardNoticesProps) {
  return (
    <>
      {lastPublishedSlug ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          Published:{" "}
          <code
            style={{
              padding: "1px 6px",
              borderRadius: 8,
              background: "rgba(0,0,0,0.06)",
            }}
          >
            {lastPublishedSlug}
          </code>
        </div>
      ) : null}

      {lastReplyNotice ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          {lastReplyNotice}
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>{error}</div>
      ) : null}
    </>
  );
}

type QuestionPublishFieldsProps = Readonly<{
  visible: boolean;
  answerTitle: string;
  answerVisibility: Visibility;
  answerPinned: boolean;
  onTitleChange: (value: string) => void;
  onVisibilityChange: (value: Visibility) => void;
  onPinnedChange: (value: boolean) => void;
}>;

function QuestionPublishFields({
  visible,
  answerTitle,
  answerVisibility,
  answerPinned,
  onTitleChange,
  onVisibilityChange,
  onPinnedChange,
}: QuestionPublishFieldsProps) {
  if (!visible) return null;

  return (
    <>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>
          Title
        </div>
        <input
          value={answerTitle}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onTitleChange(event.target.value)
          }
          style={{
            marginTop: 6,
            width: "100%",
            height: 36,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.92)",
            padding: "0 10px",
            fontSize: 13,
          }}
        />
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>
          Visibility
        </div>
        <select
          value={answerVisibility}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
            onVisibilityChange(event.target.value as Visibility)
          }
          style={{
            height: 32,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.92)",
            padding: "0 8px",
            fontSize: 12,
          }}
        >
          <option value="public">public</option>
          <option value="friend">friend</option>
          <option value="patron">patron</option>
          <option value="partner">partner</option>
        </select>

        <label
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            fontSize: 12,
            opacity: 0.85,
          }}
        >
          <input
            type="checkbox"
            checked={answerPinned}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              onPinnedChange(event.target.checked)
            }
          />
          <span>Pinned</span>
        </label>
      </div>
    </>
  );
}

type AnswerEditorProps = Readonly<{
  open: boolean;
  selection: SelectionSummary;
  answerTitle: string;
  answerText: string;
  answerVisibility: Visibility;
  answerPinned: boolean;
  publishing: boolean;
  publishError: string | null;
  onTitleChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onVisibilityChange: (value: Visibility) => void;
  onPinnedChange: (value: boolean) => void;
  onPublish: () => void;
}>;

function AnswerEditor({
  open,
  selection,
  answerTitle,
  answerText,
  answerVisibility,
  answerPinned,
  publishing,
  publishError,
  onTitleChange,
  onTextChange,
  onVisibilityChange,
  onPinnedChange,
  onPublish,
}: AnswerEditorProps) {
  if (!open) return null;

  const publishDisabled =
    publishing || !selection.canAnswer || !answerText.trim();

  return (
    <div
      style={{
        marginTop: 14,
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding: 14,
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 900 }}>
          {editorTitle(selection.isPrivateReplyMode)}
        </div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>
          {editorDescription(selection.isPrivateReplyMode)}
        </div>
      </div>

      <QuestionPublishFields
        visible={selection.isQuestionMode}
        answerTitle={answerTitle}
        answerVisibility={answerVisibility}
        answerPinned={answerPinned}
        onTitleChange={onTitleChange}
        onVisibilityChange={onVisibilityChange}
        onPinnedChange={onPinnedChange}
      />

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>
          {answerFieldLabel(selection.isPrivateReplyMode)}
        </div>
        <textarea
          value={answerText}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
            onTextChange(event.target.value)
          }
          placeholder={answerPlaceholder(selection.isPrivateReplyMode)}
          style={{
            marginTop: 6,
            width: "100%",
            minHeight: 160,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.92)",
            padding: "10px 10px",
            fontSize: 13,
            lineHeight: 1.6,
            resize: "vertical",
          }}
        />
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onPublish}
          disabled={publishDisabled}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.94)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 900,
            opacity: publishing ? 0.6 : 1,
          }}
        >
          {publishButtonLabel(publishing, selection.isPrivateReplyMode)}
        </button>

        {publishError ? (
          <div style={{ fontSize: 12, opacity: 0.8 }}>{publishError}</div>
        ) : null}
      </div>
    </div>
  );
}

type MailbagRowProps = Readonly<{
  row: Row;
  selected: boolean;
  onToggle: (id: string) => void;
}>;

function MailbagRow({ row, selected, onToggle }: MailbagRowProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr",
        gap: 10,
        padding: 12,
        borderTop: "1px solid rgba(255,255,255,0.08)",
        background: selected ? "rgba(255,255,255,0.06)" : "transparent",
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(row.id)}
        aria-label="Select item"
        style={{ marginTop: 3 }}
      />

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>
            {row.member_email ?? row.member_id}
          </div>

          <div
            style={{
              ...badgeStyle(row.kind),
              height: 20,
              padding: "0 7px",
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
            }}
          >
            {kindLabel(row.kind)}
          </div>

          <div style={{ fontSize: 12, opacity: 0.65 }}>
            {fmtDate(row.created_at)}
          </div>

          {row.answer_post_slug ? (
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              • answered in {row.answer_post_slug}
            </div>
          ) : null}

          {row.notify_email_sent_at ? (
            <div style={{ fontSize: 12, opacity: 0.65 }}>• notified</div>
          ) : null}
        </div>

        {row.asker_name ? (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.68 }}>
            as “{row.asker_name}”
          </div>
        ) : null}

        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {row.question_text}
        </div>
      </div>
    </div>
  );
}

type MailbagListProps = Readonly<{
  items: Row[];
  selected: Set<string>;
  loading: boolean;
  onToggle: (id: string) => void;
}>;

function MailbagList({
  items,
  selected,
  loading,
  onToggle,
}: MailbagListProps) {
  return (
    <div
      style={{
        marginTop: 14,
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        overflow: "hidden",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      {items.length === 0 && !loading ? (
        <div style={{ padding: 14, fontSize: 12, opacity: 0.72 }}>
          No items.
        </div>
      ) : null}

      {items.map((row) => (
        <MailbagRow
          key={row.id}
          row={row}
          selected={selected.has(row.id)}
          onToggle={onToggle}
        />
      ))}

      {loading ? (
        <div style={{ padding: 12, fontSize: 12, opacity: 0.72 }}>
          Loading…
        </div>
      ) : null}
    </div>
  );
}

type LoadMoreButtonProps = Readonly<{
  cursor: string | null;
  loading: boolean;
  onLoadMore: () => void;
}>;

function LoadMoreButton({
  cursor,
  loading,
  onLoadMore,
}: LoadMoreButtonProps) {
  if (!cursor) return null;

  return (
    <button
      type="button"
      onClick={onLoadMore}
      disabled={loading}
      style={{
        marginTop: 12,
        height: 32,
        padding: "0 12px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.04)",
        color: "rgba(255,255,255,0.92)",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      Load more
    </button>
  );
}

type MailbagDashboardViewProps = Readonly<{
  embed: boolean;
  status: Status;
  kind: KindFilter;
  items: Row[];
  cursor: string | null;
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  selection: SelectionSummary;
  answerOpen: boolean;
  answerTitle: string;
  answerText: string;
  answerVisibility: Visibility;
  answerPinned: boolean;
  publishing: boolean;
  publishError: string | null;
  lastPublishedSlug: string | null;
  lastReplyNotice: string | null;
  onStatusChange: (status: Status) => void;
  onKindChange: (kind: KindFilter) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDiscard: () => void;
  onToggleEditor: () => void;
  onTitleChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onVisibilityChange: (value: Visibility) => void;
  onPinnedChange: (value: boolean) => void;
  onPublish: () => void;
  onToggleItem: (id: string) => void;
  onLoadMore: () => void;
}>;

function MailbagDashboardView(props: MailbagDashboardViewProps) {
  const {
    embed,
    status,
    kind,
    items,
    cursor,
    loading,
    error,
    selected,
    selection,
    answerOpen,
    answerTitle,
    answerText,
    answerVisibility,
    answerPinned,
    publishing,
    publishError,
    lastPublishedSlug,
    lastReplyNotice,
    onStatusChange,
    onKindChange,
    onSelectAll,
    onClearSelection,
    onDiscard,
    onToggleEditor,
    onTitleChange,
    onTextChange,
    onVisibilityChange,
    onPinnedChange,
    onPublish,
    onToggleItem,
    onLoadMore,
  } = props;

  const statusActions = (
    <StatusActions status={status} onChange={onStatusChange} />
  );

  return (
    <AdminPageFrame
      embed={embed}
      maxWidth={1050}
      title="Mailbag"
      subtitle="Review member questions, suggestions, and bug reports from one shared inbox."
      headerActions={statusActions}
    >
      <KindFilters kind={kind} onChange={onKindChange} />

      <SelectionToolbar
        itemCount={items.length}
        selection={selection}
        status={status}
        loading={loading}
        answerOpen={answerOpen}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        onDiscard={onDiscard}
        onToggleEditor={onToggleEditor}
      />

      <DashboardNotices
        lastPublishedSlug={lastPublishedSlug}
        lastReplyNotice={lastReplyNotice}
        error={error}
      />

      <AnswerEditor
        open={answerOpen && status === "open"}
        selection={selection}
        answerTitle={answerTitle}
        answerText={answerText}
        answerVisibility={answerVisibility}
        answerPinned={answerPinned}
        publishing={publishing}
        publishError={publishError}
        onTitleChange={onTitleChange}
        onTextChange={onTextChange}
        onVisibilityChange={onVisibilityChange}
        onPinnedChange={onPinnedChange}
        onPublish={onPublish}
      />

      <MailbagList
        items={items}
        selected={selected}
        loading={loading}
        onToggle={onToggleItem}
      />

      <LoadMoreButton
        cursor={cursor}
        loading={loading}
        onLoadMore={onLoadMore}
      />
    </AdminPageFrame>
  );
}

type MailbagDashboardClientProps = Readonly<{
  embed?: boolean;
}>;

export default function MailbagDashboardClient({
  embed = false,
}: MailbagDashboardClientProps) {
  const [status, setStatus] = React.useState<Status>("open");
  const [kind, setKind] = React.useState<KindFilter>("all");
  const [items, setItems] = React.useState<Row[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [answerOpen, setAnswerOpen] = React.useState(false);
  const [answerTitle, setAnswerTitle] = React.useState("Mailbag Q&A");
  const [answerText, setAnswerText] = React.useState("");
  const [answerVisibility, setAnswerVisibility] =
    React.useState<Visibility>("public");
  const [answerPinned, setAnswerPinned] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishErr, setPublishErr] = React.useState<string | null>(null);
  const [lastPublishedSlug, setLastPublishedSlug] = React.useState<
    string | null
  >(null);
  const [lastReplyNotice, setLastReplyNotice] = React.useState<string | null>(
    null,
  );

  const selection = React.useMemo(
    () => getSelectionSummary(items, selected, status),
    [items, selected, status],
  );

  async function loadPage(reset: boolean) {
    if (loading) return;

    setLoading(true);
    setErr(null);

    try {
      const data = await requestMailbagPage({
        status,
        kind,
        cursor,
        reset,
      });

      setItems((current) =>
        reset ? data.items : [...current, ...data.items],
      );
      setCursor(data.nextCursor);

      if (reset) setSelected(new Set());
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    setAnswerOpen(false);
    setPublishErr(null);
    setLastPublishedSlug(null);
    setLastReplyNotice(null);
    void loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, kind]);

  function toggleItem(id: string) {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(items.map((item) => item.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function toggleEditor() {
    setPublishErr(null);
    setLastPublishedSlug(null);
    setLastReplyNotice(null);
    setAnswerOpen((current) => !current);

    if (!answerTitle.trim()) setAnswerTitle("Mailbag Q&A");
  }

  async function discardSelected() {
    if (status !== "open" || selection.selectedCount === 0) return;

    setLoading(true);
    setErr(null);

    const ids = Array.from(selected);
    const selectedSnapshot = new Set(ids);

    try {
      await requestDiscard(ids);
      setItems((current) =>
        current.filter((item) => !selectedSnapshot.has(item.id)),
      );
      setSelected(new Set());
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Discard failed");
    } finally {
      setLoading(false);
    }
  }

  async function publishAnswer() {
    if (!selection.canAnswer) return;

    const title = answerTitle.trim();
    const text = answerText.trim();
    if (!text) return;

    setPublishing(true);
    setPublishErr(null);
    setLastPublishedSlug(null);
    setLastReplyNotice(null);

    const ids = Array.from(selected);
    const selectedSnapshot = new Set(ids);

    try {
      const data = await requestPublish({
        ids,
        title,
        answerText: text,
        visibility: answerVisibility,
        pinned: answerPinned,
      });
      const notice = getPublishNotice(data);

      setAnswerText("");
      setAnswerOpen(false);
      setLastPublishedSlug(notice.publishedSlug);
      setLastReplyNotice(notice.replyNotice);
      setItems((current) =>
        current.filter((item) => !selectedSnapshot.has(item.id)),
      );
      setSelected(new Set());
    } catch (error) {
      setPublishErr(
        error instanceof Error ? error.message : "Publish failed",
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <MailbagDashboardView
      embed={embed}
      status={status}
      kind={kind}
      items={items}
      cursor={cursor}
      loading={loading}
      error={err}
      selected={selected}
      selection={selection}
      answerOpen={answerOpen}
      answerTitle={answerTitle}
      answerText={answerText}
      answerVisibility={answerVisibility}
      answerPinned={answerPinned}
      publishing={publishing}
      publishError={publishErr}
      lastPublishedSlug={lastPublishedSlug}
      lastReplyNotice={lastReplyNotice}
      onStatusChange={setStatus}
      onKindChange={setKind}
      onSelectAll={selectAllVisible}
      onClearSelection={clearSelection}
      onDiscard={() => void discardSelected()}
      onToggleEditor={toggleEditor}
      onTitleChange={setAnswerTitle}
      onTextChange={setAnswerText}
      onVisibilityChange={setAnswerVisibility}
      onPinnedChange={setAnswerPinned}
      onPublish={() => void publishAnswer()}
      onToggleItem={toggleItem}
      onLoadMore={() => void loadPage(false)}
    />
  );
}