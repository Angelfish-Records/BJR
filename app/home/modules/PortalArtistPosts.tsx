"use client";

import React from "react";
import ActivationGate from "@/app/home/ActivationGate";
import type { PortalArtistPostsProps } from "./portalArtistPostsTypes";
import { buildPortalArtistPostPortableTextComponents } from "./portalArtistPostsPortableText";
import { usePortalArtistPostsController } from "./usePortalArtistPostsController";
import PortalArtistPostsToolbar from "./PortalArtistPostsToolbar";
import PortalArtistPostsComposer from "./PortalArtistPostsComposer";
import PortalArtistPostItem from "./PortalArtistPostItem";

function CopyToast(props: { visible: boolean; text: string }) {
  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 18,
        transform: "translateX(-50%)",
        zIndex: 100000,
        pointerEvents: "none",
        opacity: props.visible ? 1 : 0,
        transition: "opacity 160ms ease",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          borderRadius: 999,
          padding: "10px 12px",
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(20,20,20,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          color: "rgba(255,255,255,0.92)",
          fontSize: 12,
          boxShadow: "0 18px 55px rgba(0,0,0,0.35)",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M20 7L10.5 16.5L4 10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{props.text}</span>
      </div>
    </div>
  );
}

export default function PortalArtistPosts(props: PortalArtistPostsProps) {
  const {
    pageSize,
    minVisibility,
    requireAuthAfter,
    authorName = "Brendan John Roch",
    authorInitials = "BJR",
    authorAvatarSrc,
    defaultInlineImageMaxWidthPx,
  } = props;

  const controller = usePortalArtistPostsController({
    pageSize,
    minVisibility,
    requireAuthAfter,
    authorName,
  });

  const portableTextComponents = React.useMemo(
    () =>
      buildPortalArtistPostPortableTextComponents(
        defaultInlineImageMaxWidthPx,
      ),
    [defaultInlineImageMaxWidthPx],
  );

  return (
    <div style={{ minWidth: 0, position: "relative" }}>
      <PortalArtistPostsToolbar
        postTypeFilter={controller.postTypeFilter}
        composerPresent={controller.composerPresent}
        useOverlayToolbar={controller.useOverlayToolbar}
        overlayToolbarRef={controller.overlayToolbarRef}
        onChangeFilter={controller.onChangeFilter}
        onOpenComposer={controller.openComposer}
      />

      <PortalArtistPostsComposer
        open={controller.composerOpen}
        termsOpen={controller.termsOpen}
        askerName={controller.askerName}
        questionText={controller.questionText}
        submitErr={controller.submitErr}
        submitting={controller.submitting}
        maxChars={controller.maxChars}
        maxNameChars={controller.maxNameChars}
        onClose={controller.closeComposer}
        onOpenTerms={() => controller.setTermsOpen(true)}
        onCloseTerms={() => controller.setTermsOpen(false)}
        onChangeAskerName={controller.setAskerName}
        onChangeQuestionText={controller.setQuestionText}
        onSubmit={controller.submitQuestion}
      />

      {controller.thanks ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            opacity: 0.85,
            lineHeight: 1.55,
          }}
        >
          Thank you for your question. You will receive an email when it is
          answered.
        </div>
      ) : null}

      <div
        style={{
          marginTop:
            controller.composerPresent ||
            controller.thanks ||
            !controller.useOverlayToolbar
              ? 6
              : 0,
          position: "relative",
        }}
      >
        <div
          aria-hidden={controller.inlineGateActive}
          style={{
            filter: controller.inlineGateActive ? "blur(10px)" : "none",
            opacity: controller.inlineGateActive ? 0.55 : 1,
            pointerEvents: controller.inlineGateActive ? "none" : "auto",
            transition: "filter 180ms ease, opacity 180ms ease",
          }}
        >
          {controller.posts.map((post, index) => (
            <PortalArtistPostItem
              key={post.slug}
              post={post}
              index={index}
              deepSlug={controller.deepSlug}
              copiedSlug={controller.copiedSlug}
              authorName={authorName}
              authorInitials={authorInitials}
              authorAvatarSrc={authorAvatarSrc}
              firstPostHeaderInsetPx={controller.firstPostHeaderInsetPx}
              portableTextComponents={portableTextComponents}
              registerPostElement={controller.registerPostElement}
              onShare={controller.onShare}
            />
          ))}
        </div>

        {controller.inlineGateActive ? (
          <div
            role="dialog"
            aria-modal="false"
            aria-label="Sign in to keep reading"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 50,
              pointerEvents: "auto",
              display: "block",
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            <div
              style={{
                position: "sticky",
                top: 0,
                height: "100dvh",
                padding: 14,
                display: "grid",
                placeItems: "center",
                overflow: "visible",
              }}
            >
              <div
                style={{
                  width: "min(520px, 100%)",
                  maxWidth: "calc(100% - 28px)",
                  position: "relative",
                  transform: "translateY(-6vh)",
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(16,16,16,0.78)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  boxShadow: "0 26px 90px rgba(0,0,0,0.55)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 750, opacity: 0.92 }}>
                    {controller.inlineGateMsg}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <ActivationGate>
                      <div />
                    </ActivationGate>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {controller.loading ? (
          <div style={{ fontSize: 12, opacity: 0.7, padding: "12px 0" }}>
            Loading…
          </div>
        ) : null}

        {controller.refreshing && controller.posts.length > 0 ? (
          <div style={{ fontSize: 12, opacity: 0.55, padding: "8px 0 0" }}>
            Refreshing…
          </div>
        ) : null}

        {!controller.loading &&
        !controller.refreshing &&
        controller.posts.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.75, padding: "12px 0" }}>
            No posts yet.
          </div>
        ) : null}

        {!controller.inlineGateActive && controller.cursor ? (
          <div style={{ paddingTop: 12 }}>
            <button
              type="button"
              onClick={() => void controller.fetchPage(controller.cursor)}
              disabled={controller.loading}
              style={{
                border: "none",
                background: "transparent",
                color: "rgba(255,255,255,0.70)",
                cursor: controller.loading ? "default" : "pointer",
                fontSize: 12,
                textDecoration: "underline",
                textUnderlineOffset: 3,
                opacity: controller.loading ? 0.5 : 0.85,
                padding: 0,
              }}
            >
              Load more
            </button>
          </div>
        ) : null}
      </div>

      <CopyToast visible={controller.toastVisible} text="Link copied" />
      {controller.fallbackModal}
    </div>
  );
}