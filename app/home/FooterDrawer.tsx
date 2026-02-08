// web/app/home/FooterDrawer.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type FooterKey =
  | "privacy"
  | "terms"
  | "rights"
  | "ai"
  | "licensing"
  | "security";
type Item = { key: FooterKey; title: string; body: React.ReactNode };

const STORAGE_KEY = "af_footer_drawer_open_v2";

function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [breakpointPx]);

  return isMobile;
}

export default function FooterDrawer(props: {
  emailTo?: string;
  licensingHref?: string;
}) {
  const emailTo = props.emailTo ?? "hello@angelfishrecords.com";
  const licensingHref = props.licensingHref ?? "";

  const items: Item[] = useMemo(
    () => [
      {
        key: "privacy",
        title: "Privacy",
        body: (
          <>
            Identity is email-only (Clerk). We use your email to authenticate
            access and to send opt-out first-party
            communications about releases, events, and account activity. Access decisions, entitlements, and
            playthrough telemetry are stored first-party in Neon Postgres. Streaming is delivered via Mux using
            short-lived signed tokens. We don’t sell personal data, share it
            with advertisers, or embed ad-tracking pixels. Cookies are used only
            for session/authentication and basic anti-abuse controls. Logs are
            retained only as long as necessary for access control, security,
            communications delivery, and accounting.
          </>
        ),
      },
      {
        key: "terms",
        title: "Terms",
        body: (
          <>
            Streams and downloads are licensed, not sold, unless explicitly
            stated. Access is entitlement-bound (membership/purchase) and may be
            revoked for fraud, abuse, or policy violations. You may not
            redistribute, mirror, scrape, or automate access. Sharing
            links/tokens is permitted only where the UI explicitly enables it.
          </>
        ),
      },
      {
        key: "rights",
        title: "Rights",
        body: (
          <>
            All recordings, compositions, lyrics, artwork, and audiovisual
            elements are protected by copyright and related rights. No
            synchronisation, public performance, mechanical reproduction,
            sampling, derivative works, or redistribution without written
            licence. Unauthorized uploading to third-party platforms, content-ID
            databases, or dataset aggregation is prohibited.
          </>
        ),
      },
      {
        key: "ai",
        title: "AI",
        body: (
          <>
            No automated scraping, dataset inclusion, or model training on this
            site’s content is permitted without an express written agreement.
            This includes text, audio, stems, artwork, video, metadata, and
            fingerprints.
          </>
        ),
      },
      {
        key: "licensing",
        title: "Licensing",
        body: (
          <>
            Catalogue available for sync and licensing: controlled rights, clean
            metadata, and rapid clearance. For briefs, placements, or catalogue
            partnerships, contact the label.
            {licensingHref ? (
              <>
                {" "}
                <a
                  href={licensingHref}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "rgba(255,255,255,0.70)",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  Licensing &amp; Sync →
                </a>
              </>
            ) : null}
          </>
        ),
      },
      {
        key: "security",
        title: "Security",
        body: (
          <>
            If you believe you’ve found a vulnerability or rights issue, report
            it. We respond quickly and prefer private disclosure.{" "}
            <a
              href={`mailto:${emailTo}`}
              style={{
                color: "rgba(255,255,255,0.70)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Email us
            </a>
            .
          </>
        ),
      },
    ],
    [emailTo, licensingHref],
  );

  const rootRef = useRef<HTMLElement | null>(null);

  const isMobile = useIsMobile(640);

  const [openKey, setOpenKey] = useState<FooterKey | null>(null);

  // 3) add this effect somewhere after openKey state
  useEffect(() => {
    if (!openKey) return;

    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const t = e.target as Node | null;
      if (!t) return;

      // click/tap happened outside the drawer -> close
      if (!root.contains(t)) setOpenKey(null);
    };

    // capture=true so we see it even if something stops propagation inside the app
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openKey]);

  // Desktop shared-panel height animation
  const sharedRef = useRef<HTMLDivElement | null>(null);
  const [sharedH, setSharedH] = useState(0);

  // Mobile per-item height animation
  const itemRefs = useRef(new Map<FooterKey, HTMLDivElement>());
  const [mobileHeights, setMobileHeights] = useState<Record<string, number>>(
    {},
  );

  // Always start closed on load (and nuke any old persisted state).
  useEffect(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  // Optional: keep writing for analytics/debug, but do not restore on load.
  useEffect(() => {
    try {
      if (openKey) window.localStorage.setItem(STORAGE_KEY, openKey);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [openKey]);

  // Re-measure desktop panel (no synchronous setState in effect body)
  useEffect(() => {
    if (isMobile) return;
    const el = sharedRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      setSharedH(openKey ? el.scrollHeight : 0);
    });
    return () => cancelAnimationFrame(raf);
  }, [openKey, isMobile]);

  // Re-measure mobile open item
  useEffect(() => {
    if (!isMobile) return;
    if (!openKey) return;
    const el = itemRefs.current.get(openKey);
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      setMobileHeights((prev) => ({ ...prev, [openKey]: el.scrollHeight }));
    });
    return () => cancelAnimationFrame(raf);
  }, [openKey, isMobile]);

  const active = openKey
    ? (items.find((i) => i.key === openKey) ?? null)
    : null;

  // Stable width: let the parent section control alignment; footer should fill available width.
  const rootStyle: React.CSSProperties = {
    marginTop: 16,
    padding: "10px 2px 2px",
    width: "100%",
    maxWidth: "100%",
    marginLeft: 0,
    marginRight: 0,
  };

  const titleRowStyle: React.CSSProperties = {
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    padding: "0 2px 8px",
  };

  const titleStyle = (isOpen: boolean): React.CSSProperties => ({
    appearance: "none",
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    color: isOpen ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.46)",
    fontSize: 12,
    letterSpacing: 0.2,
    lineHeight: 1.2,
    textDecoration: isOpen ? "underline" : "none",
    textUnderlineOffset: 5,
    whiteSpace: "nowrap",
  });

  const desktopPanelOuter: React.CSSProperties = {
    height: openKey ? sharedH : 0,
    overflow: "hidden",
    transition: "height 200ms ease",
  };

  const panelInner: React.CSSProperties = {
    padding: "8px 2px 10px",
    fontSize: 13,
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.62)",
    width: "100%",
    maxWidth: "100%",
  };

  const divider: React.CSSProperties = {
    height: 1,
    background: "rgba(255,255,255,0.06)",
    margin: "8px 0 0",
  };

  if (!isMobile) {
    return (
      <footer ref={rootRef} style={rootStyle} aria-label="Footer drawer">
        <div style={titleRowStyle}>
          {items.map((it) => {
            const isOpen = openKey === it.key;
            return (
              <button
                key={it.key}
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpenKey((prev) => (prev === it.key ? null : it.key))
                }
                style={titleStyle(isOpen)}
              >
                {it.title}
              </button>
            );
          })}
        </div>

        <div style={divider} />

        <div style={desktopPanelOuter} aria-hidden={!openKey}>
          <div ref={sharedRef} style={panelInner}>
            {active ? active.body : null}
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer ref={rootRef} style={rootStyle} aria-label="Footer drawer">
      <div style={divider} />

      <div style={{ display: "grid", gap: 6, paddingTop: 8 }}>
        {items.map((it) => {
          const isOpen = openKey === it.key;
          const h = isOpen ? (mobileHeights[it.key] ?? 0) : 0;

          return (
            <div key={it.key} style={{ display: "grid", gap: 4 }}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpenKey((prev) => (prev === it.key ? null : it.key))
                }
                style={{
                  ...titleStyle(isOpen),
                  textAlign: "left",
                  width: "fit-content",
                }}
              >
                {it.title}
              </button>

              <div
                style={{
                  height: h,
                  overflow: "hidden",
                  transition: "height 200ms ease",
                }}
                aria-hidden={!isOpen}
              >
                <div
                  ref={(node) => {
                    if (!node) return;
                    itemRefs.current.set(it.key, node);
                  }}
                  style={panelInner}
                >
                  {it.body}
                </div>
              </div>

              <div
                style={{ height: 1, background: "rgba(255,255,255,0.06)" }}
              />
            </div>
          );
        })}
      </div>
    </footer>
  );
}
