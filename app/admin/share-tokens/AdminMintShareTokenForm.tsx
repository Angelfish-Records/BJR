"use client";

import React from "react";
import type { AlbumBrowseItem } from "@/lib/albums";

type Props = { albums: AlbumBrowseItem[] };

type MintOk = {
  ok: true;
  token: string;
  tokenId: string;
};

type MintErr = { ok: false; error: string };

type MintResp = MintOk | MintErr;

type CopyState = "idle" | "copied" | "error";
type CopyTarget = "token" | "link";

function fmtLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }

  try {
    if (typeof document === "undefined") return false;

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";

    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);

    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function AdminMintShareTokenForm({ albums }: Props) {
  const mintable = React.useMemo(
    () => albums.filter((a) => !!a.catalogueId),
    [albums],
  );
  const hasUnmintable = React.useMemo(
    () => albums.some((a) => !a.catalogueId),
    [albums],
  );

  const [albumCatalogueId, setAlbumCatalogueId] = React.useState<string>(
    () => (mintable[0]?.catalogueId ?? "") as string,
  );

  const [expiresEnabled, setExpiresEnabled] = React.useState(false);
  const [expiresAtLocal, setExpiresAtLocal] = React.useState<string>(() =>
    fmtLocalInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  );

  const [maxRedemptions, setMaxRedemptions] = React.useState<string>("");

  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<MintResp | null>(null);

  const [tokenCopyState, setTokenCopyState] =
    React.useState<CopyState>("idle");
  const [linkCopyState, setLinkCopyState] = React.useState<CopyState>("idle");

  const tokenCopyTimerRef = React.useRef<number | null>(null);
  const linkCopyTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (tokenCopyTimerRef.current != null) {
        window.clearTimeout(tokenCopyTimerRef.current);
      }
      if (linkCopyTimerRef.current != null) {
        window.clearTimeout(linkCopyTimerRef.current);
      }
    };
  }, []);

  const selected = React.useMemo(
    () =>
      mintable.find(
        (a) => (a.catalogueId as string) === albumCatalogueId,
      ) ?? null,
    [mintable, albumCatalogueId],
  );

  const deepLink = React.useMemo(() => {
    if (!result?.ok) return null;
    if (typeof window === "undefined") return null;
    const slug = selected?.slug;
    if (!slug) return null;
    const u = new URL(`/${encodeURIComponent(slug)}`, window.location.origin);
    u.searchParams.set("st", result.token);
    return u.toString();
  }, [result, selected?.slug]);

  async function onMint() {
    setBusy(true);
    setResult(null);
    setTokenCopyState("idle");
    setLinkCopyState("idle");

    try {
      if (!albumCatalogueId) {
        setResult({
          ok: false,
          error: "No catalogueId selected (album must have catalogueId).",
        });
        return;
      }

      const expiresAt = expiresEnabled
        ? new Date(expiresAtLocal).toISOString()
        : null;

      const rawMax = maxRedemptions.trim();
      const n = rawMax ? Number(rawMax) : null;
      const max =
        n != null && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;

      const resp = await fetch("/api/admin/share-tokens/mint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          albumId: albumCatalogueId,
          expiresAt,
          maxRedemptions: max,
        }),
      });

      const json = (await resp.json()) as MintResp;
      setResult(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      setResult({ ok: false, error: msg });
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(target: CopyTarget, text: string) {
    const ok = await copyText(text);

    if (target === "token") {
      setTokenCopyState(ok ? "copied" : "error");
      if (tokenCopyTimerRef.current != null) {
        window.clearTimeout(tokenCopyTimerRef.current);
      }
      tokenCopyTimerRef.current = window.setTimeout(() => {
        setTokenCopyState("idle");
      }, 1800);
      return;
    }

    setLinkCopyState(ok ? "copied" : "error");
    if (linkCopyTimerRef.current != null) {
      window.clearTimeout(linkCopyTimerRef.current);
    }
    linkCopyTimerRef.current = window.setTimeout(() => {
      setLinkCopyState("idle");
    }, 1800);
  }

  function copyButtonLabel(state: CopyState, idleLabel: string) {
    if (state === "copied") return "Copied";
    if (state === "error") return "Copy failed";
    return idleLabel;
  }

  const cardStyle: React.CSSProperties = {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    minWidth: 0,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
  };

  const subtleButtonStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 700,
    cursor: "pointer",
  };

  const primaryButtonStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.94)",
    fontWeight: 800,
    cursor: "pointer",
  };

  const codePillStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    overflowX: "auto",
    whiteSpace: "nowrap",
    color: "rgba(255,255,255,0.94)",
  };

  if (!mintable.length) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
          No mintable albums
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.78 }}>
          No albums have <code>catalogueId</code> set. Add a{" "}
          <code>catalogueId</code> in Sanity before minting press tokens.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={cardStyle}>
        <div style={{ fontSize: 12, letterSpacing: "0.04em", opacity: 0.56 }}>
          TOKEN CONFIGURATION
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 10,
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.66 }}>Album</div>
            <select
              value={albumCatalogueId}
              onChange={(e) => setAlbumCatalogueId(e.target.value)}
              style={fieldStyle}
            >
              {mintable.map((a) => (
                <option
                  key={a.catalogueId as string}
                  value={a.catalogueId as string}
                >
                  {a.title} {a.year ? `(${a.year})` : ""} — {a.slug}
                </option>
              ))}
            </select>

            {hasUnmintable ? (
              <div style={{ fontSize: 12, lineHeight: 1.45, opacity: 0.58 }}>
                Some albums are hidden because they have no{" "}
                <code>catalogueId</code> set.
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 12,
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.66 }}>
                Max redemptions
              </div>
              <input
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="e.g. 25"
                inputMode="numeric"
                style={fieldStyle}
              />
            </div>

            <div
              style={{
                display: "grid",
                alignContent: "end",
              }}
            >
              <label
                style={{
                  display: "inline-flex",
                  gap: 10,
                  alignItems: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  opacity: 0.92,
                }}
              >
                <input
                  type="checkbox"
                  checked={expiresEnabled}
                  onChange={(e) => setExpiresEnabled(e.target.checked)}
                />
                <span>Set expiry</span>
              </label>
            </div>
          </div>

          {expiresEnabled ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.66 }}>
                Expires at (local time)
              </div>
              <input
                type="datetime-local"
                value={expiresAtLocal}
                onChange={(e) => setExpiresAtLocal(e.target.value)}
                style={fieldStyle}
              />
            </div>
          ) : null}

          <div style={{ paddingTop: 2 }}>
            <button
              type="button"
              onClick={onMint}
              disabled={busy || !albumCatalogueId}
              style={{
                ...primaryButtonStyle,
                opacity: busy || !albumCatalogueId ? 0.6 : 1,
                cursor: busy || !albumCatalogueId ? "default" : "pointer",
              }}
            >
              {busy ? "Minting…" : "Mint token"}
            </button>
          </div>
        </div>
      </div>

      {result ? (
        result.ok ? (
          <div style={cardStyle}>
            <div style={{ fontSize: 12, letterSpacing: "0.04em", opacity: 0.56 }}>
              MINT RESULT
            </div>

            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
                  Token
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <code style={codePillStyle}>{result.token}</code>
                  <button
                    type="button"
                    onClick={() => handleCopy("token", result.token)}
                    style={subtleButtonStyle}
                  >
                    {copyButtonLabel(tokenCopyState, "Copy token")}
                  </button>
                </div>
              </div>

              {deepLink ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
                    Deep link
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <code style={codePillStyle}>{deepLink}</code>
                    <button
                      type="button"
                      onClick={() => handleCopy("link", deepLink)}
                      style={subtleButtonStyle}
                    >
                      {copyButtonLabel(linkCopyState, "Copy link")}
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{ fontSize: 12, lineHeight: 1.45, opacity: 0.6 }}>
                catalogueId: <code>{albumCatalogueId}</code> • tokenId:{" "}
                <code>{result.tokenId}</code>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,140,140,0.22)",
              background: "rgba(120,0,0,0.16)",
              color: "#ffd0d0",
              display: "grid",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800 }}>Error</div>
            <code
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {result.error}
            </code>
          </div>
        )
      ) : null}
    </div>
  );
}