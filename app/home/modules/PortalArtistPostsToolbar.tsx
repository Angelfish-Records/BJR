// web/app/home/modules/PortalArtistPostsToolbar.tsx
"use client";

import React from "react";
import { usePortalViewer } from "@/app/home/PortalViewerProvider";
import { useMembershipModal } from "@/app/home/MembershipModalProvider";
import { POST_TYPES, type PostType } from "./portalArtistPostsTypes";

type SubmitQuestionCTAProps = {
  onOpenComposer: () => void;
};

function SubmitQuestionCTA(props: SubmitQuestionCTAProps) {
  const { onOpenComposer } = props;
  const { tier, isSignedIn } = usePortalViewer();
  const { openMembershipModal } = useMembershipModal();

  if (!isSignedIn || tier === "none") return null;

  const locked = tier === "friend";
  const label = locked ? "Ask a Question (Patron+)" : "Ask a Question";

  return (
    <button
      type="button"
      onClick={() => {
        if (locked) openMembershipModal();
        else onOpenComposer();
      }}
      aria-disabled={locked}
      title={
        locked
          ? "Become a Patron to submit questions."
          : "Send a question for the next Q&A post."
      }
      style={{
        height: 30,
        padding: "0 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.14)",
        background: locked
          ? "rgba(255,255,255,0.035)"
          : "rgba(255,255,255,0.07)",
        color: locked ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.92)",
        cursor: "pointer",
        opacity: locked ? 0.86 : 1,
        userSelect: "none",
        fontSize: 12,
        lineHeight: "28px",
        fontWeight: 700,
        letterSpacing: 0.2,
        transition:
          "transform 160ms ease, opacity 160ms ease, filter 160ms ease, background 160ms ease",
        boxShadow: locked ? "none" : "0 10px 24px rgba(0,0,0,0.18)",
        whiteSpace: "nowrap",
      }}
      onMouseDown={(event) => {
        const element = event.currentTarget;
        element.style.transform = "scale(0.98)";
        window.setTimeout(() => {
          element.style.transform = "scale(1)";
        }, 120);
      }}
    >
      {label}
    </button>
  );
}

function ChevronIcon(props: { open: boolean }) {
  const { open } = props;

  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{
        display: "block",
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 160ms ease",
      }}
    >
      <path
        d="M5.5 7.5L10 12L14.5 7.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type PostTypeMenuProps = {
  value: "" | PostType;
  onChange: (next: "" | PostType) => void;
  constrained?: boolean;
};

function PostTypeMenu(props: PostTypeMenuProps) {
  const { value, onChange, constrained = false } = props;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);

  const selected =
    POST_TYPES.find((option) => option.value === value) ?? POST_TYPES[0];

  React.useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent) => {
      const node = rootRef.current;
      if (!node) return;
      if (node.contains(event.target as Node)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const onSelect = React.useCallback(
    (next: "" | PostType) => {
      onChange(next);
      setOpen(false);
      buttonRef.current?.focus();
    },
    [onChange],
  );

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        flex: constrained ? "0 1 auto" : "0 0 auto",
        minWidth: 0,
        maxWidth: constrained ? "100%" : undefined,
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter posts by type"
        onClick={() => setOpen((current) => !current)}
        style={{
          height: 30,
          minWidth: 118,
          maxWidth: constrained ? "100%" : undefined,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.03))",
          color: "rgba(255,255,255,0.88)",
          padding: "0 34px 0 12px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.2,
          outline: "none",
          cursor: "pointer",
          boxShadow:
            "0 10px 24px rgba(0,0,0,0.16), 0 0 0 1px rgba(255,255,255,0.02) inset",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          whiteSpace: "nowrap",
          textAlign: "left",
          position: "relative",
        }}
      >
        <span>{selected.label}</span>

        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: 10,
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "rgba(255,255,255,0.62)",
            pointerEvents: "none",
          }}
        >
          <ChevronIcon open={open} />
        </span>
      </button>

      <div
        role="listbox"
        aria-label="Post type"
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          minWidth: "100%",
          padding: 6,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(10,10,14,0.94)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow:
            "0 24px 60px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.03) inset",
          opacity: open ? 1 : 0,
          transform: open
            ? "translateY(0px) scale(1)"
            : "translateY(-4px) scale(0.98)",
          transformOrigin: "top right",
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 150ms ease, transform 150ms ease",
          zIndex: 20,
        }}
      >
        {POST_TYPES.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.label}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(option.value)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                height: 32,
                padding: "0 10px",
                border: "none",
                borderRadius: 10,
                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                color: active
                  ? "rgba(255,255,255,0.94)"
                  : "rgba(255,255,255,0.78)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: active ? 750 : 650,
                letterSpacing: 0.18,
                textAlign: "left",
              }}
            >
              <span>{option.label}</span>
              {active ? (
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 11,
                    opacity: 0.72,
                  }}
                >
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  postTypeFilter: "" | PostType;
  composerPresent: boolean;
  useOverlayToolbar: boolean;
  overlayToolbarRef: React.RefObject<HTMLDivElement | null>;
  onChangeFilter: (next: "" | PostType) => void;
  onOpenComposer: () => void;
};

export default function PortalArtistPostsToolbar(props: Props) {
  const {
    postTypeFilter,
    composerPresent,
    useOverlayToolbar,
    overlayToolbarRef,
    onChangeFilter,
    onOpenComposer,
  } = props;

  if (useOverlayToolbar) {
    return (
      <div
        ref={overlayToolbarRef}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          zIndex: 3,
          display: "inline-flex",
          gap: 8,
          alignItems: "center",
          maxWidth: "100%",
        }}
      >
        <PostTypeMenu value={postTypeFilter} onChange={onChangeFilter} />
        <SubmitQuestionCTA onOpenComposer={onOpenComposer} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        marginTop: 2,
        marginBottom: 6,
      }}
    >
      <div
        style={{
          flex: "0 1 auto",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        {!composerPresent ? (
          <SubmitQuestionCTA onOpenComposer={onOpenComposer} />
        ) : null}
        <PostTypeMenu
          value={postTypeFilter}
          onChange={onChangeFilter}
          constrained
        />
      </div>
    </div>
  );
}
