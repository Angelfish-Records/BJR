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

function ChevronIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ display: "block" }}
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

type PostTypeSelectProps = {
  value: "" | PostType;
  onChange: (next: "" | PostType) => void;
  constrained?: boolean;
};

function PostTypeSelect(props: PostTypeSelectProps) {
  const { value, onChange, constrained = false } = props;

  return (
    <div
      style={{
        position: "relative",
        flex: constrained ? "0 1 auto" : "0 0 auto",
        minWidth: 0,
        maxWidth: constrained ? "100%" : undefined,
      }}
    >
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as "" | PostType)}
        aria-label="Filter posts by type"
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
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
        }}
      >
        {POST_TYPES.map((option) => (
          <option key={option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div
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
        <ChevronIcon />
      </div>
    </div>
  );
}

type Props = {
  postTypeFilter: "" | PostType;
  composerOpen: boolean;
  useOverlayToolbar: boolean;
  overlayToolbarRef: React.RefObject<HTMLDivElement | null>;
  onChangeFilter: (next: "" | PostType) => void;
  onOpenComposer: () => void;
};

export default function PortalArtistPostsToolbar(props: Props) {
  const {
    postTypeFilter,
    composerOpen,
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
        <PostTypeSelect value={postTypeFilter} onChange={onChangeFilter} />
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
        {!composerOpen ? (
          <SubmitQuestionCTA onOpenComposer={onOpenComposer} />
        ) : null}
        <PostTypeSelect
          value={postTypeFilter}
          onChange={onChangeFilter}
          constrained
        />
      </div>
    </div>
  );
}
