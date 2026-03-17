// web/app/home/modules/MailbagFeedbackForm.tsx
"use client";

import React from "react";

type SubmissionKind = "suggestion" | "bug_report";

type Props = {
  kind: SubmissionKind;
  title?: string;
  description?: string;
  submitLabel?: string;
  className?: string;
  embedded?: boolean;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

type ApiOk = {
  ok: true;
  kind: "question" | "suggestion" | "bug_report";
};

type ApiErr = {
  ok: false;
  code?:
    | "NOT_AUTHED"
    | "TIER_REQUIRED"
    | "RATE_LIMIT"
    | "TOO_LONG"
    | "EMPTY"
    | "BAD_REQUEST"
    | "SERVER_ERROR";
  maxChars?: number;
  limitPerDay?: number;
};

const MAX_CHARS = 800;

function kindHeading(kind: SubmissionKind): string {
  return kind === "bug_report" ? "Report a bug" : "Suggest a feature";
}

function kindDescription(kind: SubmissionKind): string {
  return kind === "bug_report"
    ? "Tell us what broke, what you expected, and anything useful about the device or browser."
    : "Tell us what you’d love to see added or improved on the site.";
}

function errorMessage(payload: ApiErr | null): string {
  if (!payload?.code) return "Something went wrong.";
  if (payload.code === "NOT_AUTHED") return "Please sign in first.";
  if (payload.code === "TIER_REQUIRED") {
    return "This feature is available to Patrons and Partners.";
  }
  if (payload.code === "RATE_LIMIT") {
    return `You’ve hit today’s submission limit${
      payload.limitPerDay ? ` (${payload.limitPerDay})` : ""
    }.`;
  }
  if (payload.code === "TOO_LONG") {
    return `Please keep it under ${payload.maxChars ?? MAX_CHARS} characters.`;
  }
  if (payload.code === "EMPTY") return "Please write something before submitting.";
  return "Something went wrong.";
}

export default function MailbagFeedbackForm(props: Props) {
  const {
    kind,
    title,
    description,
    submitLabel,
    className,
    embedded = false,
  } = props;

  const [askerName, setAskerName] = React.useState("");
  const [text, setText] = React.useState("");
  const [state, setState] = React.useState<SubmitState>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const remaining = Math.max(0, MAX_CHARS - text.length);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "submitting") return;

    setState("submitting");
    setError(null);

    try {
      const res = await fetch("/api/mailbag/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          questionText: text,
          askerName,
        }),
      });

      const raw = (await res.json().catch(() => null)) as ApiOk | ApiErr | null;

      if (!res.ok || !raw || raw.ok !== true) {
        setState("error");
        setError(errorMessage(raw && raw.ok === false ? raw : null));
        return;
      }

      setState("success");
      setText("");
    } catch {
      setState("error");
      setError("Something went wrong.");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={className}
      style={
        embedded
          ? undefined
          : {
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 18,
              padding: 16,
              background: "rgba(255,255,255,0.04)",
            }
      }
    >
      <div style={{ fontSize: embedded ? 16 : 18, fontWeight: 900 }}>
        {title ?? kindHeading(kind)}
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 13,
          lineHeight: 1.6,
          opacity: 0.72,
        }}
      >
        {description ?? kindDescription(kind)}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.74 }}>
          Display name
        </div>
        <input
          value={askerName}
          onChange={(e) => setAskerName(e.target.value)}
          placeholder="Optional"
          maxLength={48}
          style={{
            marginTop: 6,
            width: "100%",
            height: 38,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.94)",
            padding: "0 10px",
            fontSize: 13,
          }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.74 }}>
          {kind === "bug_report" ? "Bug report" : "Suggestion"}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          placeholder={
            kind === "bug_report"
              ? "Describe what happened, what you expected, and how to reproduce it."
              : "Describe the feature or improvement you’d like to see."
          }
          maxLength={MAX_CHARS}
          style={{
            marginTop: 6,
            width: "100%",
            minHeight: 160,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.94)",
            padding: "10px",
            fontSize: 13,
            lineHeight: 1.6,
            resize: "vertical",
          }}
        />
      </div>

      <div
        style={{
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.65 }}>
          {remaining} characters remaining
        </div>

        <button
          type="submit"
          disabled={state === "submitting" || text.trim().length === 0}
          style={{
            height: 36,
            padding: "0 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.96)",
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer",
            opacity: state === "submitting" ? 0.7 : 1,
          }}
        >
          {state === "submitting"
            ? "Sending…"
            : submitLabel ??
              (kind === "bug_report" ? "Send bug report" : "Send suggestion")}
        </button>
      </div>

      {state === "success" ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.82 }}>
          Thanks — your{" "}
          {kind === "bug_report" ? "bug report" : "suggestion"} has been sent.
        </div>
      ) : null}

      {state === "error" && error ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.82 }}>
          {error}
        </div>
      ) : null}
    </form>
  );
}