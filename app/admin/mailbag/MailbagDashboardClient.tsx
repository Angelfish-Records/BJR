"use client";

import React from "react";

type Status = "open" | "answered" | "discarded";
type Visibility = "public" | "friend" | "patron" | "partner";

type Row = {
  id: string;
  member_id: string;
  member_email: string | null;
  question_text: string;
  status: Status;
  created_at: string;
  updated_at: string;
  answered_at: string | null;
  answer_post_slug: string | null;
  notify_email_sent_at: string | null;
};

type ListResponse = {
  ok: boolean;
  items: Row[];
  nextCursor: string | null;
};

type AnswerResponse =
  | {
      ok: true;
      postId: string;
      postSlug: string;
      updated: number;
      answeredCount: number;
    }
  | { ok: false; code?: string };

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

function isAnswerResponse(x: unknown): x is AnswerResponse {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  if (typeof r.ok !== "boolean") return false;
  if (r.ok === true) return typeof r.postSlug === "string";
  return true;
}

export default function MailbagDashboardClient(props: { embed?: boolean }) {
  const embed = props.embed === true;
  const [status, setStatus] = React.useState<Status>("open");
  const [items, setItems] = React.useState<Row[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const selectedCount = selected.size;

  // Answer/publish UI
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

  async function loadPage(reset: boolean) {
    if (loading) return;
    setLoading(true);
    setErr(null);

    try {
      const u = new URL("/api/admin/mailbag/questions", window.location.origin);
      u.searchParams.set("status", status);
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
    void loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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

    const title = answerTitle.trim();
    const text = answerText.trim();
    if (!title || !text) return;

    setPublishing(true);
    setPublishErr(null);
    setLastPublishedSlug(null);

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

      const raw: unknown = await res.json().catch(() => null);
      const data = isAnswerResponse(raw) ? raw : null;

      if (!res.ok || !data || data.ok !== true) {
        const code = data && data.ok === false ? String(data.code ?? "") : "";
        throw new Error(
          code ? `Publish failed (${code})` : `Publish failed (${res.status})`,
        );
      }

      setLastPublishedSlug(data.postSlug);
      setAnswerText("");
      setAnswerOpen(false);

      // remove answered from the open list + clear selection
      setItems((cur) => cur.filter((x) => !selected.has(x.id)));
      setSelected(new Set());
    } catch (e) {
      setPublishErr(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  const canAnswer = status === "open" && selectedCount > 0;

  return (
    <div
      style={{
        padding: embed ? 12 : 18,
        maxWidth: embed ? undefined : 1050,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Mailbag</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
            Review questions. Publish a Q&A post from selected items.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {(["open", "answered", "discarded"] as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.10)",
                background: status === s ? "rgba(0,0,0,0.06)" : "transparent",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
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
            border: "1px solid rgba(0,0,0,0.10)",
            background: "transparent",
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
            border: "1px solid rgba(0,0,0,0.10)",
            background: "transparent",
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
                border: "1px solid rgba(160,0,0,0.18)",
                background: "rgba(160,0,0,0.06)",
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
              {answerOpen ? "Close editor" : "Answer selected"}
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

      {err ? (
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>{err}</div>
      ) : null}

      {answerOpen && status === "open" ? (
        <div
          style={{
            marginTop: 14,
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 14,
            padding: 12,
            background: "rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "baseline",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 900 }}>
              Publish Q&A post
            </div>
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              Questions will be inserted above your answer automatically.
            </div>
          </div>

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
                height: 34,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
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
                border: "1px solid rgba(0,0,0,0.12)",
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

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.75 }}>
              Answer
            </div>
            <textarea
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="Write your answer. (Blank lines become paragraph breaks.)"
              style={{
                marginTop: 6,
                width: "100%",
                minHeight: 160,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
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
              disabled={
                publishing ||
                !canAnswer ||
                !answerTitle.trim() ||
                !answerText.trim()
              }
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "rgba(0,0,0,0.06)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 900,
                opacity: publishing ? 0.6 : 1,
              }}
            >
              {publishing ? "Publishing…" : "Publish post"}
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
          border: "1px solid rgba(0,0,0,0.10)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {items.length === 0 && !loading ? (
          <div style={{ padding: 14, fontSize: 12, opacity: 0.75 }}>
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
                borderTop: "1px solid rgba(0,0,0,0.08)",
                background: on ? "rgba(0,0,0,0.03)" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(q.id)}
                aria-label="Select question"
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
          <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
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
            border: "1px solid rgba(0,0,0,0.10)",
            background: "transparent",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
