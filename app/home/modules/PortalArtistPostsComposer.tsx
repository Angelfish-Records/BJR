// web/app/home/modules/PortalArtistPostsComposer.tsx
"use client";

import React from "react";

type TermsModalProps = {
  open: boolean;
  onClose: () => void;
};

function TermsModal(props: TermsModalProps) {
  const { open, onClose } = props;

  React.useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Question terms and conditions"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        className="portalPanelFrame--gold"
        style={{
          width: "min(520px, 100%)",
          borderRadius: 20,
          padding: 1,
          overflow: "hidden",
        }}
      >
        <div
          className="portalPanelInner--gold"
          style={{
            borderRadius: 19,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 14,
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              borderBottom: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.92 }}>
              Terms &amp; Conditions
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                border: "none",
                background: "transparent",
                color: "rgba(255,255,255,0.72)",
                cursor: "pointer",
                fontSize: 12,
                opacity: 0.9,
              }}
            >
              Close
            </button>
          </div>

          <div style={{ padding: 14 }}>
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.84)",
              }}
            >
              <p style={{ margin: "0 0 10px" }}>
                You are voluntarily submitting a question to the official website
                of Brendan John Roch, which is wholly owned and managed by
                Angelfish Records. If your question is selected, it, along with
                the response, will be published on this website.
              </p>

              <p style={{ margin: "0 0 10px" }}>
                Any personal information contained in your submission may be
                published in accordance with these terms and conditions and you
                give your express consent thereto.
              </p>

              <p style={{ margin: "0 0 10px" }}>
                By submitting your question, you grant Angelfish Records the
                non-exclusive right to publish, reproduce, and distribute the
                question and its corresponding answer on this website or in the
                Brendan John Roch mailer.
              </p>

              <p style={{ margin: "0 0 10px" }}>
                We reserve the right to edit the question and answer for clarity
                and other editorial considerations.
              </p>
            </div>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.88)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 750,
                }}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  termsOpen: boolean;
  askerName: string;
  questionText: string;
  submitErr: string | null;
  submitting: boolean;
  maxChars: number;
  maxNameChars: number;
  onClose: () => void;
  onOpenTerms: () => void;
  onCloseTerms: () => void;
  onChangeAskerName: (value: string) => void;
  onChangeQuestionText: (value: string) => void;
  onSubmit: () => void | Promise<void>;
};

export default function PortalArtistPostsComposer(props: Props) {
  const {
    open,
    termsOpen,
    askerName,
    questionText,
    submitErr,
    submitting,
    maxChars,
    maxNameChars,
    onClose,
    onOpenTerms,
    onCloseTerms,
    onChangeAskerName,
    onChangeQuestionText,
    onSubmit,
  } = props;

  const trimmedLength = questionText.trim().length;

  return (
    <>
      <div
        style={{
          marginTop: open ? 2 : 0,
          maxHeight: open ? 420 : 0,
          opacity: open ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 280ms ease, opacity 220ms ease",
        }}
        aria-hidden={!open}
      >
        <div
          className="portalPanel portalPanel--gold portalPanelFrame--gold"
          style={{
            borderRadius: 20,
            padding: 1,
            overflow: "hidden",
          }}
        >
          <div
            className="portalPanelInner--gold"
            style={{
              borderRadius: 19,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 750, opacity: 0.92 }}>
                  Ask Me Anything
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "rgba(255,255,255,0.70)",
                    cursor: "pointer",
                    fontSize: 12,
                    opacity: 0.85,
                  }}
                >
                  Close
                </button>
              </div>

              <input
                value={askerName}
                onChange={(event) => onChangeAskerName(event.target.value)}
                maxLength={maxNameChars + 20}
                placeholder="[Optional] Your name / city / handle"
                style={{
                  width: "100%",
                  height: 38,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.22))",
                  color: "rgba(255,255,255,0.92)",
                  padding: "0 12px",
                  fontSize: 13,
                  outline: "none",
                  marginBottom: 10,
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.02) inset",
                }}
              />

              <textarea
                value={questionText}
                onChange={(event) => onChangeQuestionText(event.target.value)}
                maxLength={maxChars + 200}
                placeholder="Your question will be added to the mailbag."
                style={{
                  width: "100%",
                  minHeight: 108,
                  resize: "vertical",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.22))",
                  color: "rgba(255,255,255,0.92)",
                  padding: "10px 12px",
                  fontSize: 13,
                  lineHeight: 1.6,
                  outline: "none",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.02) inset",
                }}
              />

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.62 }}>
                    {trimmedLength}/{maxChars}
                    {trimmedLength > maxChars ? (
                      <span style={{ marginLeft: 8, opacity: 0.95 }}>
                        • too long
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={onOpenTerms}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "rgba(255,255,255,0.72)",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 12,
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
                      opacity: 0.9,
                      alignSelf: "flex-start",
                    }}
                  >
                    Terms & Conditions
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void onSubmit()}
                  disabled={submitting}
                  style={{
                    height: 30,
                    padding: "0 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(255, 220, 150, 0.18)",
                    background:
                      "linear-gradient(180deg, rgba(255, 219, 145, 0.18), rgba(225, 192, 253, 0.12))",
                    color: "rgba(255,255,255,0.94)",
                    cursor: submitting ? "default" : "pointer",
                    opacity: submitting ? 0.6 : 1,
                    userSelect: "none",
                    fontSize: 12,
                    lineHeight: "28px",
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    boxShadow:
                      "0 8px 22px rgba(0,0,0,0.24), 0 0 0 1px rgba(255,255,255,0.04) inset",
                  }}
                >
                  {submitting ? "Sending…" : "Send"}
                </button>
              </div>

              {submitErr ? (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.78 }}>
                  {submitErr}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <TermsModal open={termsOpen} onClose={onCloseTerms} />
    </>
  );
}