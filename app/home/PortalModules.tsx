// web/app/home/PortalModules.tsx
import React from "react";
import { PortableText } from "@portabletext/react";
import type { PortableTextBlock } from "@portabletext/types";
import { listCurrentEntitlementKeys } from "../../lib/entitlements";
import { getAlbumOffer, type AlbumOfferAsset } from "../../lib/albumOffers";
import { urlFor } from "../../sanity/lib/image";
import BuyAlbumButton from "./modules/BuyAlbumButton";
import DownloadAlbumButton from "./modules/DownloadAlbumButton";
import GiftAlbumButton from "./modules/GiftAlbumButton";
import PortalTabs, { type PortalTabSpec } from "./PortalTabs";
import PortalArtistPosts from "./modules/PortalArtistPosts";
import PortalExegesis from "./modules/PortalExegesis";

// --------------------
// Module discriminated unions
// --------------------

type ModuleHeading = {
  _key: string;
  _type: "moduleHeading";
  title?: string;
  blurb?: string;
};

type ModulePanels = {
  _key: string;
  _type: "modulePanels";
  title?: string;
  layout?: 1 | 2 | 3;
  panels: Array<{
    _key: string;
    title: string;
    teaser?: import("@portabletext/types").PortableTextBlock[];
    full?: import("@portabletext/types").PortableTextBlock[];
    requiresEntitlement?: string | null;
    styleVariant?: "default" | "gold" | "patternPill";
  }>;
};

type SanityImage = {
  _type: "image";
  asset: { _ref: string; _type: "reference" };
  crop?: unknown;
  hotspot?: unknown;
};

type DownloadAssetSel = { assetId: string; label?: string };

type ModuleDownloads = {
  _key: string;
  _type: "moduleDownloads";
  title?: string;
  albumSlug: string;
  assets?: DownloadAssetSel[];
  coverImage?: SanityImage;
  productLabel?: string;
  highlights?: string[];
  techSpec?: string;
  giftBlurb?: string;
};

type PortalDownloadOffer = {
  albumSlug: string;
  coverImage?: SanityImage;
  productLabel?: string;
  highlights?: string[];
  techSpec?: string;
  giftBlurb?: string;
  assets?: DownloadAssetSel[];
};

type ModuleDownloadGrid = {
  _key: string;
  _type: "moduleDownloadGrid";
  title?: string;
  offers: PortalDownloadOffer[];
};

type ModuleArtistPosts = {
  _key: string;
  _type: "moduleArtistPosts";
  title?: string;
  pageSize?: number;
  requireAuthAfter?: number;
  minVisibility?: "public" | "friend" | "patron" | "partner";
};

type ModuleExegesis = {
  _key: string;
  _type: "moduleExegesis";
  title?: string;
};

type PortalModule =
  | ModuleHeading
  | ModulePanels
  | ModuleDownloads
  | ModuleDownloadGrid
  | ModuleArtistPosts
  | ModuleExegesis;

type Props = {
  modules: PortalModule[];
  memberId: string | null;
};

// --------------------
// Helpers
// --------------------

function hasKey(
  entitlementKeys: string[],
  key: string | null | undefined,
): boolean {
  if (!key) return true;
  return entitlementKeys.includes(key);
}

/**
 * Tier ladder: higher tiers imply lower tiers.
 * Keep this explicit so it stays readable and hard to misconfigure.
 */
function expandEntitlementKeys(keys: string[]): string[] {
  if (!Array.isArray(keys) || keys.length === 0) return [];

  const set = new Set(keys);

  // Adjust to match your real tier keys
  if (set.has("tier_partner")) {
    set.add("tier_patron");
    set.add("tier_friend");
  }

  if (set.has("tier_patron")) {
    set.add("tier_friend");
  }

  return Array.from(set);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type PTSpan = { _type: "span"; text: string };
type PTNode = PortableTextBlock | { _type: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function hasType(x: unknown): x is { _type: string } {
  return isRecord(x) && typeof x._type === "string";
}

function isSpan(x: unknown): x is PTSpan {
  if (!hasType(x) || x._type !== "span") return false;
  if (!isRecord(x)) return false;

  const rec: Record<string, unknown> = x;
  return typeof rec["text"] === "string";
}

function getChildren(x: unknown): readonly unknown[] {
  if (!isRecord(x)) return [];
  const kids = x.children;
  return Array.isArray(kids) ? kids : [];
}

/**
 * Treat PortableText as "present" only if:
 * - any non-block node exists (image/custom object), OR
 * - any span contains non-whitespace text.
 *
 * No `any`, and no reliance on non-exported portabletext types.
 */
function portableTextHasContent(
  blocks: readonly PTNode[] | null | undefined,
): boolean {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;

  for (const b of blocks as readonly unknown[]) {
    if (!hasType(b)) continue;

    // Non-block nodes count as content
    if (b._type !== "block") return true;

    // Block: scan children for text spans
    for (const ch of getChildren(b)) {
      if (isSpan(ch) && ch.text.trim()) return true;

      // Optional: if you want inline non-span children (e.g. inline objects)
      // to also count as content, uncomment:
      // if (hasType(ch) && ch._type !== "span") return true;
    }
  }

  return false;
}

type PanelVariant = "default" | "gold" | "patternPill";

function PanelShell(props: {
  variant: PanelVariant;
  children: React.ReactNode;
}) {
  const { variant, children } = props;

  if (variant !== "gold") return <>{children}</>;

  // Gradient border frame (MembershipModal style)
  return (
    <div
      className="portalPanelFrame portalPanelFrame--gold"
      style={{
        borderRadius: 18,
        padding: 1, // gradient thickness
        transform: "translateZ(0)",
      }}
    >
      <div style={{ borderRadius: 17 }}>{children}</div>
    </div>
  );
}

function Panel(props: {
  title: string;
  blocks: PortableTextBlock[];
  locked?: boolean;
  variant?: "default" | "gold" | "patternPill";
}) {
  const { title, blocks, locked, variant = "default" } = props;

  return (
    <div
      data-variant={variant}
      className={`portalPanel portalPanel--${variant}`}
      style={{
        borderRadius: 16,
        padding: 14,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 14, opacity: 0.92 }}>{title}</div>
        {locked ? (
          <div style={{ fontSize: 12, opacity: 0.6 }}>locked</div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          opacity: locked ? 0.62 : 0.82,
          lineHeight: 1.6,
        }}
      >
        <PortableText value={blocks} />
      </div>
    </div>
  );
}

function buildAssetsToRender(
  offerAssets: AlbumOfferAsset[],
  configured: DownloadAssetSel[] | null,
) {
  const assetsToRender: Array<{
    asset: AlbumOfferAsset;
    labelOverride?: string;
  }> = [];

  if (configured) {
    for (const sel of configured) {
      const found = offerAssets.find((a) => a.id === sel.assetId);
      if (found)
        assetsToRender.push({ asset: found, labelOverride: sel.label });
    }
  } else {
    for (const asset of offerAssets) assetsToRender.push({ asset });
  }

  const missingConfiguredIds =
    configured?.filter(
      (sel) => !offerAssets.some((a) => a.id === sel.assetId),
    ) ?? [];
  return { assetsToRender, missingConfiguredIds };
}

// --------------------
// Single offer card (Bandcamp-style, self-contained)
// --------------------

function NoteRow(props: { icon: React.ReactNode; children: React.ReactNode }) {
  const { icon, children } = props;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "22px 1fr",
        gap: 10,
        alignItems: "start",
      }}
    >
      <div style={{ opacity: 0.75, marginTop: 1 }}>{icon}</div>
      <div style={{ opacity: 0.8, lineHeight: 1.45 }}>{children}</div>
    </div>
  );
}

const ICON_WAVE = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M3 12c3 0 3-6 6-6s3 12 6 12 3-6 6-6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ICON_FORMATS = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M20 13.5 12.5 21a2 2 0 0 1-2.8 0L3 14.3V4h10.3L20 10.7a2 2 0 0 1 0 2.8Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M7.8 7.8h.01"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

const ICON_DOLLAR = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3v18"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      opacity="0.5"
    />
    <path
      d="M16.8 7.2c-1-1-2.6-1.7-4.8-1.7-2.5 0-4.5 1.1-4.5 3.1 0 4.2 9.7 1.8 9.7 6.2 0 2.1-2 3.2-4.6 3.2-2.2 0-4-.7-5.1-1.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function DownloadOfferCard(props: {
  albumSlug: string;
  owned: boolean;
  coverImage?: SanityImage;
  productLabel?: string;
  highlights?: string[];
  techSpec?: string;
  assets?: DownloadAssetSel[];
}) {
  const {
    albumSlug,
    owned,
    coverImage,
    productLabel,
    highlights,
    techSpec,
    assets,
  } = props;

  const offerCfg = getAlbumOffer(albumSlug);
  const title = offerCfg?.title ?? albumSlug;
  const artistName = offerCfg?.artistName;
  const priceLabel = offerCfg?.priceLabel;
  const offerAssets: AlbumOfferAsset[] = offerCfg?.assets ?? [];
  const configured = assets && assets.length > 0 ? assets : null;
  const { assetsToRender, missingConfiguredIds } = buildAssetsToRender(
    offerAssets,
    configured,
  );

  const coverUrl = coverImage
    ? urlFor(coverImage).width(900).height(900).fit("crop").url()
    : null;

  const includesText = offerCfg?.includes?.length
    ? `Includes ${offerCfg.includes.join(", ")}.`
    : "Includes streaming + multiple download formats.";

  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.18)",
        padding: 16,
        minWidth: 0,
      }}
    >
      {coverUrl ? (
        /* eslint-disable @next/next/no-img-element */
        <img
          src={coverUrl}
          alt={title}
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            objectFit: "cover",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.02)",
          }}
        />
      ) : null}

      <div style={{ marginTop: coverUrl ? 12 : 0 }}>
        <div style={{ fontSize: 22, opacity: 0.95, lineHeight: 1.1 }}>
          {title}
        </div>
        {artistName ? (
          <div style={{ marginTop: 6, fontSize: 14, opacity: 0.72 }}>
            by {artistName}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {productLabel ?? "Digital Album"}
          </div>
          {!owned && priceLabel ? (
            <div style={{ fontSize: 18, fontWeight: 650, opacity: 0.92 }}>
              {priceLabel}
            </div>
          ) : null}
        </div>
      </div>

      {/* Optional highlights we already support */}
      {highlights && highlights.length > 0 ? (
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gap: 8,
            fontSize: 13,
            opacity: 0.78,
            lineHeight: 1.5,
          }}
        >
          {highlights.map((h, i) => (
            <div key={`${i}:${h}`}>{h}</div>
          ))}
        </div>
      ) : null}

      {/* Bandcamp-style icon notes (hard-coded) */}
      <div style={{ marginTop: 14, display: "grid", gap: 10, fontSize: 13 }}>
        <NoteRow icon={ICON_WAVE}>{includesText}</NoteRow>
        <NoteRow icon={ICON_FORMATS}>
          {techSpec ?? "Download available in 24-bit / 96kHz."}
        </NoteRow>
        <NoteRow icon={ICON_DOLLAR}>
          Your money goes directly to the artist.
        </NoteRow>
      </div>

      {!offerCfg ? (
        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.75 }}>
          Missing AlbumOffer config for <code>{albumSlug}</code>.
        </div>
      ) : owned ? (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {offerAssets.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              No downloadable assets configured in <code>albumOffers.ts</code>.
            </div>
          ) : (
            <>
              {missingConfiguredIds.length > 0 ? (
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  Invalid assetId(s) referenced in Sanity:{" "}
                  {missingConfiguredIds.map((x) => x.assetId).join(", ")}
                </div>
              ) : null}

              <div
                style={{
                  display: "grid",
                  gap: 10,
                  width: "100%",
                  justifyItems: "stretch", // 🔑 same rail behavior as Buy
                }}
              >
                {assetsToRender.map(({ asset, labelOverride }, i) => (
                  <DownloadAlbumButton
                    key={asset.id}
                    albumSlug={albumSlug}
                    assetId={asset.id}
                    label={labelOverride ?? asset.label}
                    variant={i === 0 ? "primary" : "ghost"}
                    fullWidth={i === 0}
                    style={i === 0 ? { width: "100%" } : undefined}
                  />
                ))}
              </div>

              {/* Keep gift available, but visually separated */}
              <div style={{ paddingTop: 2, textAlign: "center" }}>
                <GiftAlbumButton
                  albumTitle={title}
                  albumSlug={albumSlug}
                  ctaLabel="Send as gift"
                  variant="link"
                />
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <BuyAlbumButton
            albumSlug={albumSlug}
            label="Buy Digital Album"
            variant="primary"
            fullWidth
          />

          <div style={{ textAlign: "center" }}>
            <GiftAlbumButton
              albumTitle={title}
              albumSlug={albumSlug}
              ctaLabel="Send as gift"
              variant="link"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------
// Module renderer (reused per tab)
// --------------------

function renderModule(m: PortalModule, entitlementKeys: string[]) {
  if (m._type === "moduleHeading") return null;

  if (m._type === "modulePanels") {
    const cols: 1 | 2 | 3 =
      m.layout === 1 || m.layout === 2 || m.layout === 3 ? m.layout : 2;

    const gridClass =
      cols === 1
        ? "grid gap-3"
        : cols === 2
          ? "grid gap-3 grid-cols-1 sm:grid-cols-2"
          : "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

    const visiblePanels = (m.panels ?? []).flatMap((p) => {
      const locked =
        !!p.requiresEntitlement &&
        !hasKey(entitlementKeys, p.requiresEntitlement);

      // Locked viewers: only show if teaser has real content
      if (locked) {
        if (!portableTextHasContent(p.teaser)) return [];
        return [
          {
            key: p._key,
            title: p.title,
            blocks: p.teaser ?? [],
            locked: true,
            variant: p.styleVariant ?? "default",
          },
        ];
      }

      // Entitled (or ungated): show full if it has content; if it doesn't, skip quietly
      if (!portableTextHasContent(p.full)) return [];
      return [
        {
          key: p._key,
          title: p.title,
          blocks: p.full ?? [],
          locked: false,
          variant: p.styleVariant ?? "default",
        },
      ];
    });

    if (visiblePanels.length === 0) return null;

    return (
      <div key={m._key} style={{ width: "100%", minWidth: 0 }}>
        {m.title ? (
          <div
            style={{
              fontSize: 15,
              opacity: 0.92,
              marginBottom: 10,
              padding: "0 2px", // tiny optical alignment
            }}
          >
            {m.title}
          </div>
        ) : null}

        <div className={gridClass}>
          {visiblePanels.map((p) => (
            <PanelShell key={p.key} variant={p.variant}>
              <Panel
                title={p.title}
                blocks={p.blocks}
                locked={p.locked}
                variant={p.variant}
              />
            </PanelShell>
          ))}
        </div>
      </div>
    );
  }

  if (m._type === "moduleDownloadGrid") {
    return (
      <div
        key={m._key}
        className="portalDownloadGrid2up"
        style={{ minWidth: 0 }}
      >
        {m.offers.map((o, idx) => {
          const offerCfg = getAlbumOffer(o.albumSlug);
          const owned = !!(
            offerCfg && entitlementKeys.includes(offerCfg.entitlementKey)
          );

          return (
            <DownloadOfferCard
              key={`${m._key}:${idx}:${o.albumSlug}`}
              albumSlug={o.albumSlug}
              owned={owned}
              coverImage={o.coverImage}
              productLabel={o.productLabel}
              highlights={o.highlights}
              techSpec={o.techSpec}
              assets={o.assets}
            />
          );
        })}
      </div>
    );
  }

  if (m._type === "moduleDownloads") {
    const offerCfg = getAlbumOffer(m.albumSlug);
    const owned = !!(
      offerCfg && entitlementKeys.includes(offerCfg.entitlementKey)
    );

    return (
      <div
        key={m._key}
        className="portalDownloadGrid2up"
        style={{ minWidth: 0 }}
      >
        <DownloadOfferCard
          albumSlug={m.albumSlug}
          owned={owned}
          coverImage={m.coverImage}
          productLabel={m.productLabel}
          highlights={m.highlights}
          techSpec={m.techSpec}
          assets={m.assets}
        />
      </div>
    );
  }

  if (m._type === "moduleArtistPosts") {
    return (
      <PortalArtistPosts
        key={m._key}
        title={m.title ?? "Journal"}
        pageSize={m.pageSize ?? 10}
        requireAuthAfter={m.requireAuthAfter ?? 3}
        minVisibility={m.minVisibility ?? "public"}
        authorAvatarSrc="https://www.brendanjohnroch.com/gfx/BJR_posts_avatar.jpeg"
      />
    );
  }

  if (m._type === "moduleExegesis") {
    return <PortalExegesis key={m._key} title={m.title ?? "Exegesis"} />;
  }

  return null;
}

// --------------------
// Tab inference
// --------------------

type BuiltTab = {
  id: string;
  title: string;
  locked?: boolean;
  lockedHint?: string | null;
  modules: PortalModule[];
};

function inferTabs(
  modules: PortalModule[],
  entitlementKeys: string[],
): BuiltTab[] {
  const out: BuiltTab[] = [];
  let current: BuiltTab | null = null;

  const pushCurrent = () => {
    if (!current) return;
    if (current.modules.length === 0) return;
    out.push(current);
  };

  for (const m of modules) {
    if (m._type === "moduleHeading") {
      pushCurrent();

      const title = (m.title ?? "").trim() || "Portal";
      const id = slugify(title) || m._key;

      current = { id, title, locked: false, lockedHint: null, modules: [] };
      continue;
    }

    if (!current) {
      current = {
        id: "download",
        title: "Download",
        locked: false,
        lockedHint: null,
        modules: [],
      };
    }

    current.modules.push(m);
  }

  pushCurrent();

  for (const t of out) {
    const first = t.modules[0] ?? null;
    if (!first) continue;

    // Optional: mark a tab "locked" if its first module is Panels and *all* panels are gated
    // and the viewer is not entitled to any of them.
    if (first._type === "modulePanels") {
      const panels = first.panels ?? [];
      if (panels.length === 0) continue;

      const entitledToAtLeastOne = panels.some((p) =>
        hasKey(entitlementKeys, p.requiresEntitlement),
      );

      const allAreGated = panels.every((p) => !!p.requiresEntitlement);

      if (allAreGated && !entitledToAtLeastOne) {
        t.locked = true;
        t.lockedHint = "Locked";
      }
    }
  }

  return out;
}

// --------------------
// Main renderer
// --------------------

export default async function PortalModules(props: Props) {
  const { modules, memberId } = props;
  const entitlementKeysRaw = memberId
    ? await listCurrentEntitlementKeys(memberId)
    : [];

  const entitlementKeys = expandEntitlementKeys(entitlementKeysRaw);

  const tabsBuilt = inferTabs(modules, entitlementKeys);

  const tabs: PortalTabSpec[] = tabsBuilt.map((t) => ({
    id: t.id,
    title: t.title,
    locked: t.locked,
    lockedHint: t.lockedHint,
    content: (
      <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
        {t.modules.map((m) => renderModule(m, entitlementKeys))}
      </div>
    ),
  }));

  return <PortalTabs tabs={tabs} defaultTabId={tabs[0]?.id ?? null} />;
}
