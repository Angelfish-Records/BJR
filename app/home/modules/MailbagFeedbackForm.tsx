// web/app/home/modules/MailbagFeedbackForm.tsx
"use client";

import React from "react";

type SubmissionKind = "suggestion" | "bug_report";

type Props = {
  kind?: SubmissionKind;
  title?: string;
  description?: string;
  submitLabel?: string;
  className?: string;
  embedded?: boolean;
  allowKindSwitch?: boolean;
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
  if (payload.code === "EMPTY")
    return "Please write something before submitting.";
  return "Something went wrong.";
}

export default function MailbagFeedbackForm(props: Props) {
  const {
    kind: kindProp,
    submitLabel,
    className,
    embedded = false,
    allowKindSwitch = false,
  } = props;

  const [kind, setKind] = React.useState<SubmissionKind>(
    kindProp ?? "suggestion",
  );
  const [askerName] = React.useState("");
  const rootRef = React.useRef<HTMLFormElement | null>(null);
  const [text, setText] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);
  const [state, setState] = React.useState<SubmitState>("idle");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (kindProp) setKind(kindProp);
  }, [kindProp]);

  React.useEffect(() => {
    if (!expanded || text.length > 0) return;

    function onPointerDown(e: PointerEvent) {
      const root = rootRef.current;
      const target = e.target;

      if (!root || !(target instanceof Node)) return;
      if (root.contains(target)) return;

      setExpanded(false);
      setError(null);
      if (state !== "submitting") setState("idle");
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [expanded, state, text.length]);

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
      ref={rootRef}
      onSubmit={onSubmit}
      className={className}
      style={
        embedded
          ? undefined
          : {
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 18,
              padding: 10,
              background: "rgba(255,255,255,0.025)",
            }
      }
    >
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            width: "100%",
            minHeight: 42,
            border: embedded ? 0 : "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14,
            background: embedded ? "transparent" : "rgba(255,255,255,0.035)",
            color: "rgba(255,255,255,0.76)",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            textAlign: "left",
            padding: "0 14px",
          }}
        >
          {props.title ??
            (kind === "bug_report"
              ? "Report a small problem"
              : "Leave a suggestion")}
        </button>
      ) : (
        <div
          style={{
            overflow: "hidden",
            border: embedded ? 0 : "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16,
            background: embedded ? "transparent" : "rgba(255,255,255,0.045)",
          }}
        >
          {allowKindSwitch ? (
            <div
              role="tablist"
              aria-label="Feedback type"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.12)",
              }}
            >
              {(["suggestion", "bug_report"] as const).map((nextKind) => {
                const active = kind === nextKind;

                return (
                  <button
                    key={nextKind}
                    type="button"
                    onClick={() => setKind(nextKind)}
                    aria-pressed={active}
                    style={{
                      height: 36,
                      border: 0,
                      borderRight:
                        nextKind === "suggestion"
                          ? "1px solid rgba(255,255,255,0.08)"
                          : 0,
                      background: active
                        ? "rgba(255,255,255,0.1)"
                        : "transparent",
                      color: active
                        ? "rgba(255,255,255,0.94)"
                        : "rgba(255,255,255,0.58)",
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {nextKind === "bug_report" ? "Bug report" : "Suggestion"}
                  </button>
                );
              })}
            </div>
          ) : null}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            placeholder={
              props.description ??
              (kind === "bug_report"
                ? "What happened? What did you expect? How can I reproduce it?"
                : "What content or features would you like to see here?")
            }
            maxLength={MAX_CHARS}
            autoFocus
            style={{
              display: "block",
              width: "100%",
              minHeight: 132,
              border: 0,
              outline: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.94)",
              padding: "12px 12px 8px",
              fontSize: 13,
              lineHeight: 1.6,
              resize: "vertical",
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              alignItems: "center",
              padding: "0 8px 8px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setError(null);
                if (state !== "submitting") setState("idle");
              }}
              style={{
                height: 32,
                padding: "0 11px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "transparent",
                color: "rgba(255,255,255,0.52)",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Close
            </button>

            <button
              type="submit"
              disabled={state === "submitting" || text.trim().length === 0}
              style={{
                height: 32,
                padding: "0 13px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background:
                  text.trim().length === 0
                    ? "rgba(255,255,255,0.055)"
                    : "rgba(255,255,255,0.13)",
                color:
                  text.trim().length === 0
                    ? "rgba(255,255,255,0.42)"
                    : "rgba(255,255,255,0.94)",
                fontSize: 12,
                fontWeight: 900,
                cursor:
                  state === "submitting" || text.trim().length === 0
                    ? "default"
                    : "pointer",
                opacity: state === "submitting" ? 0.72 : 1,
              }}
            >
              {state === "submitting"
                ? "Sending…"
                : (submitLabel ??
                  (kind === "bug_report"
                    ? "Send bug report"
                    : "Send suggestion"))}
            </button>
          </div>
        </div>
      )}

      {state === "success" ? (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.72 }}>
          Thanks — your {kind === "bug_report" ? "bug report" : "suggestion"}{" "}
          has been sent.
        </div>
      ) : null}

      {state === "error" && error ? (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.72 }}>{error}</div>
      ) : null}
    </form>
  );
}
