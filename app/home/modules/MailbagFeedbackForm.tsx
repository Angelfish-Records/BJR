// web/app/home/modules/MailbagFeedbackForm.tsx
"use client";

import React from "react";

type SubmissionKind = "suggestion" | "bug_report";

type Props = Readonly<{
  kind?: SubmissionKind;
  title?: string;
  description?: string;
  submitLabel?: string;
  className?: string;
  embedded?: boolean;
  allowKindSwitch?: boolean;
}>;

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

type SetExpanded = React.Dispatch<React.SetStateAction<boolean>>;
type SetSubmitState = React.Dispatch<React.SetStateAction<SubmitState>>;
type SetError = React.Dispatch<React.SetStateAction<string | null>>;
type SetText = React.Dispatch<React.SetStateAction<string>>;

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
  if (payload.code === "EMPTY") {
    return "Please write something before submitting.";
  }
  return "Something went wrong.";
}

function defaultTitle(kind: SubmissionKind): string {
  return kind === "bug_report"
    ? "Report a small problem"
    : "Leave a suggestion";
}

function defaultDescription(kind: SubmissionKind): string {
  return kind === "bug_report"
    ? "What happened? What did you expect? How can I reproduce it?"
    : "What content or features would you like to see here?";
}

function defaultSubmitLabel(kind: SubmissionKind): string {
  return kind === "bug_report" ? "Send bug report" : "Send suggestion";
}

function submitButtonLabel(
  state: SubmitState,
  submitLabel: string | undefined,
  kind: SubmissionKind,
): string {
  if (state === "submitting") return "Sending…";
  return submitLabel ?? defaultSubmitLabel(kind);
}

function submissionNoun(kind: SubmissionKind): string {
  return kind === "bug_report" ? "bug report" : "suggestion";
}

function formStyle(embedded: boolean): React.CSSProperties | undefined {
  if (embedded) return undefined;

  return {
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 10,
    background: "rgba(255,255,255,0.025)",
  };
}

function promptStyle(embedded: boolean): React.CSSProperties {
  return {
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
  };
}

function editorStyle(embedded: boolean): React.CSSProperties {
  return {
    overflow: "hidden",
    border: embedded ? 0 : "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    background: embedded ? "transparent" : "rgba(255,255,255,0.045)",
  };
}

function kindSwitchButtonStyle(
  nextKind: SubmissionKind,
  active: boolean,
): React.CSSProperties {
  return {
    height: 36,
    border: 0,
    borderRight:
      nextKind === "suggestion"
        ? "1px solid rgba(255,255,255,0.08)"
        : 0,
    background: active ? "rgba(255,255,255,0.1)" : "transparent",
    color: active
      ? "rgba(255,255,255,0.94)"
      : "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    cursor: "pointer",
  };
}

function kindSwitchLabel(kind: SubmissionKind): string {
  return kind === "bug_report" ? "Bug report" : "Suggestion";
}

function submitStyle(
  isEmpty: boolean,
  isSubmitting: boolean,
): React.CSSProperties {
  return {
    height: 32,
    padding: "0 13px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: isEmpty
      ? "rgba(255,255,255,0.055)"
      : "rgba(255,255,255,0.13)",
    color: isEmpty ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.94)",
    fontSize: 12,
    fontWeight: 900,
    cursor: isSubmitting || isEmpty ? "default" : "pointer",
    opacity: isSubmitting ? 0.72 : 1,
  };
}

function collapseFeedbackForm(params: Readonly<{
  state: SubmitState;
  setExpanded: SetExpanded;
  setError: SetError;
  setState: SetSubmitState;
}>): void {
  params.setExpanded(false);
  params.setError(null);
  if (params.state !== "submitting") {
    params.setState("idle");
  }
}

function useOutsideCollapse(params: Readonly<{
  expanded: boolean;
  textLength: number;
  state: SubmitState;
  rootRef: React.RefObject<HTMLFormElement | null>;
  setExpanded: SetExpanded;
  setError: SetError;
  setState: SetSubmitState;
}>): void {
  const {
    expanded,
    textLength,
    state,
    rootRef,
    setExpanded,
    setError,
    setState,
  } = params;

  React.useEffect(() => {
    if (!expanded || textLength > 0) return;

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      const target = event.target;

      if (!root || !(target instanceof Node)) return;
      if (root.contains(target)) return;

      collapseFeedbackForm({ state, setExpanded, setError, setState });
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [
    expanded,
    rootRef,
    setError,
    setExpanded,
    setState,
    state,
    textLength,
  ]);
}

async function submitFeedback(params: Readonly<{
  kind: SubmissionKind;
  text: string;
  askerName: string;
}>): Promise<string | null> {
  try {
    const res = await fetch("/api/mailbag/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: params.kind,
        questionText: params.text,
        askerName: params.askerName,
      }),
    });

    const raw = (await res.json().catch(() => null)) as ApiOk | ApiErr | null;

    if (!res.ok || raw?.ok !== true) {
      return errorMessage(raw?.ok === false ? raw : null);
    }

    return null;
  } catch {
    return "Something went wrong.";
  }
}

async function handleSubmit(
  event: React.FormEvent<HTMLFormElement>,
  params: Readonly<{
    kind: SubmissionKind;
    text: string;
    askerName: string;
    state: SubmitState;
    setState: SetSubmitState;
    setError: SetError;
    setText: SetText;
  }>,
): Promise<void> {
  event.preventDefault();
  if (params.state === "submitting") return;

  params.setState("submitting");
  params.setError(null);

  const submitError = await submitFeedback({
    kind: params.kind,
    text: params.text,
    askerName: params.askerName,
  });

  if (submitError) {
    params.setState("error");
    params.setError(submitError);
    return;
  }

  params.setState("success");
  params.setText("");
}

export default function MailbagFeedbackForm(props: Props) {
  const {
    kind: kindProp,
    title,
    description,
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

  useOutsideCollapse({
    expanded,
    textLength: text.length,
    state,
    rootRef,
    setExpanded,
    setError,
    setState,
  });

  const isEmpty = text.trim().length === 0;
  const isSubmitting = state === "submitting";
  const closeForm = () =>
    collapseFeedbackForm({ state, setExpanded, setError, setState });

  return (
    <form
      ref={rootRef}
      onSubmit={(event) =>
        void handleSubmit(event, {
          kind,
          text,
          askerName,
          state,
          setState,
          setError,
          setText,
        })
      }
      className={className}
      style={formStyle(embedded)}
    >
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={promptStyle(embedded)}
        >
          {title ?? defaultTitle(kind)}
        </button>
      ) : (
        <div style={editorStyle(embedded)}>
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
                    style={kindSwitchButtonStyle(nextKind, active)}
                  >
                    {kindSwitchLabel(nextKind)}
                  </button>
                );
              })}
            </div>
          ) : null}

          <textarea
            value={text}
            onChange={(event) =>
              setText(event.target.value.slice(0, MAX_CHARS))
            }
            placeholder={description ?? defaultDescription(kind)}
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
              onClick={closeForm}
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
              disabled={isSubmitting || isEmpty}
              style={submitStyle(isEmpty, isSubmitting)}
            >
              {submitButtonLabel(state, submitLabel, kind)}
            </button>
          </div>
        </div>
      )}

      {state === "success" ? (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.72 }}>
          Thanks, your {submissionNoun(kind)} has been sent.
        </div>
      ) : null}

      {state === "error" && error ? (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.72 }}>{error}</div>
      ) : null}
    </form>
  );
}
