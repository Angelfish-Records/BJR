"use client";

import React from "react";
import {
  performShare,
  buildShareTarget,
  type ShareTarget,
} from "@/lib/share";

function CopyFallbackModal(props: { url: string; onClose: () => void }) {
  const ref = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={props.onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(20,20,20,0.92)",
          padding: 14,
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 10 }}>
          Copy link
        </div>
        <input
          ref={ref}
          readOnly
          value={props.url}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            fontSize: 12,
          }}
        />
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 12,
          }}
        >
          <button
            onClick={props.onClose}
            style={{
              borderRadius: 12,
              padding: "8px 12px",
              border: "1px solid rgba(255,255,255,0.16)",
              background: "transparent",
              color: "white",
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function useShareAction() {
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null);

  const share = React.useCallback(async (target: ShareTarget) => {
    const res = await performShare(target);

    if (!res.ok && res.reason === "clipboard_unavailable") {
      setFallbackUrl(res.url);
    }

    return res;
  }, []);

  // Maintained for compatibility with existing callers
  const openIntentSheet = React.useCallback(
    (target: ShareTarget) => {
      void share(target);
    },
    [share],
  );

  const fallbackModal = fallbackUrl ? (
    <CopyFallbackModal
      url={fallbackUrl}
      onClose={() => setFallbackUrl(null)}
    />
  ) : null;

  return {
    share,
    openIntentSheet,
    intentSheet: null,
    fallbackModal,
  };
}

// Clean memo with proper dependency handling
export function useShareBuilders() {
  return React.useMemo(() => {
    return {
      album: (album: {
        slug: string;
        title: string;
        artistName?: string;
        id?: string;
      }) =>
        buildShareTarget({
          type: "album",
          methodHint: "native",
          album,
        }),

      track: (
        album: {
          slug: string;
          title: string;
          artistName?: string;
          id?: string;
        },
        track: { id: string; title: string },
      ) =>
        buildShareTarget({
          type: "track",
          methodHint: "native",
          album,
          track,
        }),

      post: (
        post: { slug: string; title?: string; id?: string },
        authorName?: string,
      ) =>
        buildShareTarget({
          type: "post",
          methodHint: "native",
          post,
          authorName,
        }),
    };
  }, []); // buildShareTarget is static import; safe to omit
}
