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

function isPublishResponse(x: unknown): x is PublishResponse {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  if (typeof r.ok !== "boolean") return false;
  if (r.ok === true) {
    if (r.mode !== "published_post" && r.mode !== "private_reply") return false;
    return (
      r.kind === "question" ||
      r.kind === "suggestion" ||
      r.kind === "bug_report"
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

export default function MailbagDashboardClient(props: { embed?: boolean }) {
  const embed = props.embed === true;

  const [status, setStatus] = React.useState<Status>("open");
  const [kind, setKind] = React.useState<KindFilter>("all");
  const [items, setItems] = React.useState<Row[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const selectedCount = selected.size;

  const selectedItems = React.useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  );

  const selectedKinds = React.useMemo(
    () => Array.from(new Set(selectedItems.map((item) => item.kind))),
    [selectedItems],
  );

  const selectedKind: SubmissionKind | null =
    selectedKinds.length === 1 ? selectedKinds[0] : null;

  const mixedSelectedKinds = selectedKinds.length > 1;
  const privateReplySelectionInvalid =
    selectedKind !== null && selectedKind !== "question" && selectedCount !== 1;

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

  async function loadPage(reset: boolean) {
    if (loading) return;
    setLoading(true);
    setErr(null);

    try {
      const u = new URL("/api/admin/mailbag/questions", window.location.origin);
      u.searchParams.set("status", status);
      u.searchParams.set("kind", kind);
      u.searchParams.set("limit", "60");
      if (!reset && cursor) u.searchParams.set("cursor", cursor);

      const res = await fetch(u.toString(), { method: "GET" });
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);

      const data = (await res.json()) as ListResponse;
      if (!data.ok) throw new Error("Bad response");

      setItems((cur) => (reset ? data.items : [...cur, ...data.items]));
      setCursor(data.nextCursor);
      if (reset) setSelected(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
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

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(items.map((x) => x.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function discardSelected() {
    if (selectedCount === 0) return;
    if (status !== "open") return;

    setLoading(true);
    setErr(null);

    try {
      const ids = Array.from(selected);
      const res = await fetch("/api/admin/mailbag/questions/discard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(`Discard failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; updated?: number };

      if (!data.ok) throw new Error("Discard failed");

      setItems((cur) => cur.filter((x) => !selected.has(x.id)));
      setSelected(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Discard failed");
    } finally {
      setLoading(false);
    }
  }

  async function publishAnswer() {
    if (status !== "open") return;
    if (selectedCount === 0) return;
    if (mixedSelectedKinds) return;
    if (privateReplySelectionInvalid) return;

    const title = answerTitle.trim();
    const text = answerText.trim();
    if (!text) return;

    setPublishing(true);
    setPublishErr(null);
    setLastPublishedSlug(null);
    setLastReplyNotice(null);

    try {
      const ids = Array.from(selected);

      const res = await fetch("/api/admin/mailbag/questions/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids,
          title,
          answerText: text,
          visibility: answerVisibility,
          pinned: answerPinned,
        }),
      });

      let raw: unknown = null;
      try {
        raw = await res.json();
      } catch {
        raw = null;
      }

      const data = isPublishResponse(raw) ? raw : null;

      if (!res.ok || !data || data.ok !== true) {
        const code =
          data && data.ok === false && typeof data.code === "string"
            ? data.code
            : "";
        throw new Error(
          code ? `Publish failed (${code})` : `Publish failed (${res.status})`,
        );
      }

      setAnswerText("");
      setAnswerOpen(false);

      if (data.mode === "published_post" && data.post?.slug) {
        setLastPublishedSlug(data.post.slug);
      } else {
        setLastReplyNotice(
          `Reply sent for ${kindLabel(data.kind)}${data.notified ? ` (${data.notified.sent}/${data.notified.attempted} delivered)` : ""}.`,
        );
      }

      setItems((cur) => cur.filter((x) => !selected.has(x.id)));
      setSelected(new Set());
    } catch (e) {
      setPublishErr(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  const canAnswer =
    status === "open" &&
    selectedCount > 0 &&
    !mixedSelectedKinds &&
    !privateReplySelectionInvalid;

  const isQuestionMode = selectedKind === "question";
  const isPrivateReplyMode =
    selectedKind === "suggestion" || selectedKind === "bug_report";

  const statusActions = (
    <>
      {(["open", "answered", "discarded"] as Status[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setStatus(s)}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background:
              status === s
                ? "rgba(255,255,255,0.10)"
                : "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.92)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            opacity: status === s ? 1 : 0.82,
          }}
        >
          {s}
        </button>
      ))}
    </>
  );

  return (
    <AdminPageFrame
      embed={embed}
      maxWidth={1050}
      title="Mailbag"
      subtitle="Review member questions, suggestions, and bug reports from one shared inbox."
      headerActions={statusActions}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {(["all", "question", "suggestion", "bug_report"] as KindFilter[]).map(
          (value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
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
              {value === "all"
                ? "all"
                : value === "bug_report"
                  ? "bug reports"
                  : `${value}s`}
            </button>
          ),
        )}
      </div>

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
          onClick={selectAllVisible}
          disabled={items.length === 0}
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
          onClick={clearSelection}
          disabled={selectedCount === 0}
          style={{
            height: 30,
            padding: "0 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.92)",
            cursor: "pointer",
            fontSize: 12,
            opacity: selectedCount ? 1 : 0.5,
          }}
        >
          Clear selection
        </button>

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Selected: {selectedCount}
        </div>

        {selectedKind ? (
          <div
            style={{
              ...badgeStyle(selectedKind),
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
            {kindLabel(selectedKind)}
          </div>
        ) : null}

        {mixedSelectedKinds ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Mixed kinds cannot be answered together.
          </div>
        ) : null}

        {privateReplySelectionInvalid ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Suggestions and bug reports must be replied to one at a time.
          </div>
        ) : null}

        {status === "open" ? (
          <>
            <button
              type="button"
              onClick={() => void discardSelected()}
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
              onClick={() => {
                setPublishErr(null);
                setLastPublishedSlug(null);
                setLastReplyNotice(null);
                setAnswerOpen((v) => !v);
                if (!answerTitle.trim()) setAnswerTitle("Mailbag Q&A");
              }}
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
              {answerOpen
                ? "Close editor"
                : isPrivateReplyMode
                  ? "Reply to selected"
                  : "Answer selected"}
            </button>
          </>
        ) : null}
      </div>

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

      {err ? (
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>{err}</div>
      ) : null}

      {answerOpen && status === "open" ? (
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
              {isPrivateReplyMode ? "Send private reply" : "Publish Q&A post"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              {isPrivateReplyMode
                ? "This reply is emailed to the submitter and stored on the row. No public post will be created."
                : "Selected questions will be inserted above your answer automatically."}
            </div>
          </div>

          {isQuestionMode ? (
            <>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>
                  Title
                </div>
                <input
                  value={answerTitle}
                  onChange={(e) => setAnswerTitle(e.target.value)}
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
                  onChange={(e) =>
                    setAnswerVisibility(e.target.value as Visibility)
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
                    onChange={(e) => setAnswerPinned(e.target.checked)}
                  />
                  Pinned
                </label>
              </div>
            </>
          ) : null}

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>
              {isPrivateReplyMode ? "Reply" : "Answer"}
            </div>
            <textarea
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder={
                isPrivateReplyMode
                  ? "Write your reply to this member."
                  : "Write your answer. (Blank lines become paragraph breaks.)"
              }
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
              onClick={() => void publishAnswer()}
              disabled={publishing || !canAnswer || !answerText.trim()}
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
              {publishing
                ? isPrivateReplyMode
                  ? "Sending…"
                  : "Publishing…"
                : isPrivateReplyMode
                  ? "Send reply"
                  : "Publish post"}
            </button>

            {publishErr ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>{publishErr}</div>
            ) : null}
          </div>
        </div>
      ) : null}

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

        {items.map((q) => {
          const on = selected.has(q.id);
          return (
            <div
              key={q.id}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr",
                gap: 10,
                padding: 12,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                background: on ? "rgba(255,255,255,0.06)" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(q.id)}
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
                    {q.member_email ?? q.member_id}
                  </div>

                  <div
                    style={{
                      ...badgeStyle(q.kind),
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
                    {kindLabel(q.kind)}
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    {fmtDate(q.created_at)}
                  </div>

                  {q.answer_post_slug ? (
                    <div style={{ fontSize: 12, opacity: 0.65 }}>
                      • answered in {q.answer_post_slug}
                    </div>
                  ) : null}

                  {q.notify_email_sent_at ? (
                    <div style={{ fontSize: 12, opacity: 0.65 }}>
                      • notified
                    </div>
                  ) : null}
                </div>

                {q.asker_name ? (
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.68 }}>
                    as “{q.asker_name}”
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
                  {q.question_text}
                </div>
              </div>
            </div>
          );
        })}

        {loading ? (
          <div style={{ padding: 12, fontSize: 12, opacity: 0.72 }}>
            Loading…
          </div>
        ) : null}
      </div>

      {cursor ? (
        <button
          type="button"
          onClick={() => void loadPage(false)}
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
      ) : null}
    </AdminPageFrame>
  );
}
