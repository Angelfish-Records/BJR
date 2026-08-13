// web/app/home/PortalModules.tsx
"use client";

import dynamic from "next/dynamic";
import React from "react";
import { PortableText } from "@portabletext/react";
import type { PortableTextBlock } from "@portabletext/types";
import { getAlbumOffer, type AlbumOfferAsset } from "../../lib/albumOffers";
import { urlFor } from "../../sanity/lib/image";
import type { PortalMemberSummary } from "../../lib/memberDashboard";
import type {
  PanelStyleVariant,
  PortalModule,
  PortalModuleDownloads,
  SanityImage,
} from "../../lib/portal";
import BuyAlbumButton from "./modules/BuyAlbumButton";
import DownloadAlbumButton from "./modules/DownloadAlbumButton";
import GiftAlbumButton from "./modules/GiftAlbumButton";
import PortalTabs, { type PortalTabSpec } from "./PortalTabs";

const PortalArtistPosts = dynamic(() => import("./modules/PortalArtistPosts"));

const PortalExegesis = dynamic(() => import("./modules/PortalExegesis"));

const PortalMemberPanel = dynamic(() => import("./modules/PortalMemberPanel"));

const MailbagFeedbackForm = dynamic(
  () => import("./modules/MailbagFeedbackForm"),
);

type DownloadAssetSel = NonNullable<PortalModuleDownloads["assets"]>[number];

type Props = Readonly<{
  modules: PortalModule[];
  memberId: string | null;
  entitlementKeys: string[];
  memberSummary?: PortalMemberSummary | null;
  isPortalActive: boolean;
}>;

function hasKey(
  entitlementKeys: string[],
  key: string | null | undefined,
): boolean {
  if (!key) return true;
  return entitlementKeys.includes(key);
}

function expandEntitlementKeys(keys: string[]): string[] {
  if (!Array.isArray(keys) || keys.length === 0) return [];

  const set = new Set(keys);

  if (set.has("tier_partner")) {
    set.add("tier_patron");
    set.add("tier_friend");
  }

  if (set.has("tier_patron")) {
    set.add("tier_friend");
  }

  return Array.from(set);
}

function hasMeaningfulMemberSummary(
  summary: PortalMemberSummary | null | undefined,
): boolean {
  if (!summary) return false;
  if (summary.identity) return true;
  if (summary.contributionCount != null) return true;
  if (summary.minutesStreamed != null) return true;
  if (summary.favouriteTrack) return true;
  if (summary.badges.length > 0) return true;
  return false;
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

function portableTextHasContent(
  blocks: readonly PTNode[] | null | undefined,
): boolean {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;

  for (const b of blocks as readonly unknown[]) {
    if (!hasType(b)) continue;

    if (b._type !== "block") return true;

    for (const ch of getChildren(b)) {
      if (isSpan(ch) && ch.text.trim()) return true;
    }
  }

  return false;
}

type PanelVariant = "default" | "gold" | "patternPill";

type RuntimePanelKind = "none" | "memberSummary" | "feedbackForm";

function isFeedbackRuntimePanelKind(
  value: string | null | undefined,
): value is "feedbackForm" {
  return value === "feedbackForm";
}

function PanelShell(
  props: Readonly<{
    variant: PanelVariant;
    children: React.ReactNode;
  }>,
) {
  const { variant, children } = props;

  if (variant !== "gold") return <>{children}</>;

  return (
    <div
      className="portalPanelFrame portalPanelFrame--gold"
      style={{
        borderRadius: 18,
        padding: 1,
        transform: "translateZ(0)",
      }}
    >
      <div
        className="portalPanelInner portalPanelInner--gold"
        style={{
          borderRadius: 17,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Panel(
  props: Readonly<{
    blocks: PortableTextBlock[];
    locked?: boolean;
    variant?: "default" | "gold" | "patternPill";
  }>,
) {
  const { blocks, locked, variant = "default" } = props;

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
      <div
        style={{
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

function RuntimeMemberPanelCard(
  props: Readonly<{
    title: string;
    summary: PortalMemberSummary;
    variant: PanelVariant;
  }>,
) {
  const { title, summary, variant } = props;

  return (
    <div
      className={`portalPanel portalPanel--${variant}`}
      style={{
        borderRadius: 16,
        padding: 14,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 13,
          opacity: 0.82,
          lineHeight: 1.6,
        }}
      >
        <PortalMemberPanel summary={summary} title={title} embedded />
      </div>
    </div>
  );
}

function RuntimeFeedbackPanelCard(
  props: Readonly<{
    title: string;
    description?: string | null;
    submitLabel?: string | null;
    variant: PanelVariant;
  }>,
) {
  const { title, description, submitLabel, variant } = props;

  return (
    <div
      className={`portalPanel portalPanel--${variant}`}
      style={{
        borderRadius: 16,
        padding: 14,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 13,
          opacity: 0.82,
          lineHeight: 1.6,
        }}
      >
        <MailbagFeedbackForm
          title={title}
          description={description ?? undefined}
          submitLabel={submitLabel ?? undefined}
          embedded
          allowKindSwitch
        />
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
      if (found) {
        assetsToRender.push({ asset: found, labelOverride: sel.label });
      }
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

function NoteRow(
  props: Readonly<{ icon: React.ReactNode; children: React.ReactNode }>,
) {
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

type OccurrenceKeyed<T> = Readonly<{
  key: string;
  value: T;
}>;

function addOccurrenceKeys<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
): OccurrenceKeyed<T>[] {
  const counts = new Map<string, number>();

  return values.map((value) => {
    const baseKey = keyOf(value);
    const occurrence = counts.get(baseKey) ?? 0;
    counts.set(baseKey, occurrence + 1);
    return { key: `${baseKey}:${occurrence}`, value };
  });
}

type AssetsToRender = ReturnType<typeof buildAssetsToRender>["assetsToRender"];
type MissingConfiguredIds = ReturnType<
  typeof buildAssetsToRender
>["missingConfiguredIds"];

function OfferHighlights(
  props: Readonly<{
    highlights?: string[];
  }>,
) {
  const { highlights } = props;
  if (!highlights?.length) return null;

  const keyedHighlights = addOccurrenceKeys(
    highlights,
    (highlight) => highlight,
  );

  return (
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
      {keyedHighlights.map(({ key, value }) => (
        <div key={key}>{value}</div>
      ))}
    </div>
  );
}

function DownloadFormatSelector(
  props: Readonly<{
    assets: AssetsToRender;
    selectedAssetId: string;
    onSelect: (assetId: string) => void;
  }>,
) {
  const { assets, selectedAssetId, onSelect } = props;

  if (assets.length <= 1) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 650,
          opacity: 0.66,
          letterSpacing: "0.02em",
        }}
      >
        Download format
      </div>

      <div
        role="group"
        aria-label="Download format"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${assets.length}, minmax(0, 1fr))`,
          gap: 8,
          width: "100%",
        }}
      >
        {assets.map(({ asset }) => {
          const selected = asset.id === selectedAssetId;

          return (
            <button
              key={asset.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(asset.id)}
              style={{
                minWidth: 0,
                minHeight: 48,
                borderRadius: 12,
                border: selected
                  ? "1px solid rgba(255,255,255,0.52)"
                  : "1px solid rgba(255,255,255,0.14)",
                background: selected
                  ? "rgba(255,255,255,0.13)"
                  : "rgba(255,255,255,0.035)",
                color: "rgba(255,255,255,0.94)",
                padding: "8px 6px",
                display: "grid",
                placeItems: "center",
                gap: 2,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  lineHeight: 1.1,
                  fontWeight: selected ? 750 : 650,
                }}
              >
                {asset.selectorLabel ?? asset.label}
              </span>

              {asset.recommended ? (
                <span
                  style={{
                    fontSize: 9,
                    lineHeight: 1,
                    opacity: selected ? 0.78 : 0.56,
                    textTransform: "uppercase",
                    letterSpacing: "0.055em",
                    fontWeight: 700,
                  }}
                >
                  Recommended
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OwnedDownloadActions(
  props: Readonly<{
    albumSlug: string;
    title: string;
    offerAssets: AlbumOfferAsset[];
    assetsToRender: AssetsToRender;
    missingConfiguredIds: MissingConfiguredIds;
  }>,
) {
  const {
    albumSlug,
    title,
    offerAssets,
    assetsToRender,
    missingConfiguredIds,
  } = props;

  const formatAssets = assetsToRender.filter(
    ({ asset }) => asset.kind === "format",
  );
  const archiveAssets = assetsToRender.filter(
    ({ asset }) => asset.kind === "archive",
  );

  const preferredFormat =
    formatAssets.find(({ asset }) => asset.recommended) ??
    formatAssets[0] ??
    null;

  const [selectedAssetId, setSelectedAssetId] = React.useState(
    () => preferredFormat?.asset.id ?? "",
  );

  const selectedFormat =
    formatAssets.find(({ asset }) => asset.id === selectedAssetId) ??
    preferredFormat;

  const primaryAsset =
    selectedFormat ?? archiveAssets[0] ?? assetsToRender[0] ?? null;

  if (offerAssets.length === 0) {
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          No downloadable assets configured in <code>albumOffers.ts</code>.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
      {missingConfiguredIds.length > 0 ? (
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Invalid assetId(s) referenced in Sanity:{" "}
          {missingConfiguredIds.map((item) => item.assetId).join(", ")}
        </div>
      ) : null}

      <DownloadFormatSelector
        assets={formatAssets}
        selectedAssetId={primaryAsset?.asset.id ?? ""}
        onSelect={setSelectedAssetId}
      />

      {primaryAsset ? (
        <DownloadAlbumButton
          albumSlug={albumSlug}
          assetId={primaryAsset.asset.id}
          label={primaryAsset.labelOverride ?? primaryAsset.asset.label}
          variant="primary"
          fullWidth
          style={{ width: "100%" }}
        />
      ) : null}

      {archiveAssets
        .filter(({ asset }) => asset.id !== primaryAsset?.asset.id)
        .map(({ asset, labelOverride }) => (
          <div key={asset.id} style={{ textAlign: "center" }}>
            <DownloadAlbumButton
              albumSlug={albumSlug}
              assetId={asset.id}
              label={labelOverride ?? asset.label}
              variant="link"
            />
          </div>
        ))}

      <div style={{ paddingTop: 2, textAlign: "center" }}>
        <GiftAlbumButton
          albumTitle={title}
          albumSlug={albumSlug}
          ctaLabel="Send as gift"
          variant="link"
        />
      </div>
    </div>
  );
}

function PurchaseDownloadActions(
  props: Readonly<{
    albumSlug: string;
    title: string;
  }>,
) {
  const { albumSlug, title } = props;

  return (
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
  );
}

function DownloadOfferActions(
  props: Readonly<{
    albumSlug: string;
    title: string;
    hasOffer: boolean;
    owned: boolean;
    offerAssets: AlbumOfferAsset[];
    assetsToRender: AssetsToRender;
    missingConfiguredIds: MissingConfiguredIds;
  }>,
) {
  const {
    albumSlug,
    title,
    hasOffer,
    owned,
    offerAssets,
    assetsToRender,
    missingConfiguredIds,
  } = props;

  if (!hasOffer) {
    return (
      <div style={{ marginTop: 14, fontSize: 13, opacity: 0.75 }}>
        Missing AlbumOffer config for <code>{albumSlug}</code>.
      </div>
    );
  }

  if (owned) {
    return (
      <OwnedDownloadActions
        albumSlug={albumSlug}
        title={title}
        offerAssets={offerAssets}
        assetsToRender={assetsToRender}
        missingConfiguredIds={missingConfiguredIds}
      />
    );
  }

  return <PurchaseDownloadActions albumSlug={albumSlug} title={title} />;
}

function DownloadOfferCard(
  props: Readonly<{
    albumSlug: string;
    owned: boolean;
    coverImage?: SanityImage;
    productLabel?: string;
    highlights?: string[];
    techSpec?: string;
    assets?: DownloadAssetSel[];
  }>,
) {
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
    ? offerCfg.includes.join(", ")
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

      <OfferHighlights highlights={highlights} />

      <div style={{ marginTop: 14, display: "grid", gap: 10, fontSize: 13 }}>
        <NoteRow icon={ICON_WAVE}>{includesText}</NoteRow>
        <NoteRow icon={ICON_FORMATS}>
          {techSpec ?? "Original 24-bit studio masters"}
        </NoteRow>
        <NoteRow icon={ICON_DOLLAR}>
          Your money goes directly to the artist
        </NoteRow>
      </div>

      <DownloadOfferActions
        albumSlug={albumSlug}
        title={title}
        hasOffer={Boolean(offerCfg)}
        owned={owned}
        offerAssets={offerAssets}
        assetsToRender={assetsToRender}
        missingConfiguredIds={missingConfiguredIds}
      />
    </div>
  );
}

type VisibleAuthoredPanel = {
  key: string;
  title: string;
  blocks: PortableTextBlock[];
  locked: boolean;
  variant: PanelStyleVariant;
  runtimePanelKind: "none";
};

type VisibleRuntimeMemberPanel = {
  key: string;
  title: string;
  locked: false;
  variant: PanelStyleVariant;
  runtimePanelKind: "memberSummary";
  runtimeSummary: PortalMemberSummary;
};

type VisibleRuntimeFeedbackPanel = {
  key: string;
  title: string;
  locked: false;
  variant: PanelStyleVariant;
  runtimePanelKind: "feedbackForm";
  runtimeDescription: string | null;
  runtimeSubmitLabel: string | null;
};

type VisiblePanel =
  | VisibleAuthoredPanel
  | VisibleRuntimeMemberPanel
  | VisibleRuntimeFeedbackPanel;

type PanelsModule = Extract<PortalModule, { _type: "modulePanels" }>;
type PanelDefinition = PanelsModule["panels"][number];
type DownloadGridModule = Extract<
  PortalModule,
  { _type: "moduleDownloadGrid" }
>;
type DownloadsModule = Extract<PortalModule, { _type: "moduleDownloads" }>;
type MemberPanelModule = Extract<PortalModule, { _type: "moduleMemberPanel" }>;

function panelIsLocked(
  panel: PanelDefinition,
  entitlementKeys: string[],
): boolean {
  return (
    Boolean(panel.requiresEntitlement) &&
    !hasKey(entitlementKeys, panel.requiresEntitlement)
  );
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function resolveVisiblePanel(
  panel: PanelDefinition,
  entitlementKeys: string[],
  memberSummary: PortalMemberSummary | null,
): VisiblePanel | null {
  const locked = panelIsLocked(panel, entitlementKeys);
  const variant = panel.styleVariant ?? "default";
  const runtimeKind = (panel.runtimePanelKind ?? "none") as RuntimePanelKind;

  if (runtimeKind === "memberSummary") {
    if (
      locked ||
      !memberSummary ||
      !hasMeaningfulMemberSummary(memberSummary)
    ) {
      return null;
    }

    return {
      key: panel._key,
      title: panel.title,
      locked: false,
      variant,
      runtimePanelKind: "memberSummary",
      runtimeSummary: memberSummary,
    };
  }

  if (isFeedbackRuntimePanelKind(runtimeKind)) {
    if (locked) return null;

    return {
      key: panel._key,
      title: panel.title,
      locked: false,
      variant,
      runtimePanelKind: runtimeKind,
      runtimeDescription: optionalString(panel.runtimeDescription),
      runtimeSubmitLabel: optionalString(panel.runtimeSubmitLabel),
    };
  }

  const blocks = locked ? panel.teaser : panel.full;
  if (!portableTextHasContent(blocks)) return null;

  return {
    key: panel._key,
    title: panel.title,
    blocks: blocks ?? [],
    locked,
    variant,
    runtimePanelKind: "none",
  };
}

function renderVisiblePanel(panel: VisiblePanel): React.ReactNode {
  switch (panel.runtimePanelKind) {
    case "memberSummary":
      return (
        <PanelShell key={panel.key} variant={panel.variant}>
          <RuntimeMemberPanelCard
            title={panel.title}
            summary={panel.runtimeSummary}
            variant={panel.variant}
          />
        </PanelShell>
      );

    case "feedbackForm":
      return (
        <PanelShell key={panel.key} variant={panel.variant}>
          <RuntimeFeedbackPanelCard
            title={panel.title}
            description={panel.runtimeDescription}
            submitLabel={panel.runtimeSubmitLabel}
            variant={panel.variant}
          />
        </PanelShell>
      );

    case "none":
      return (
        <PanelShell key={panel.key} variant={panel.variant}>
          <Panel
            blocks={panel.blocks}
            locked={panel.locked}
            variant={panel.variant}
          />
        </PanelShell>
      );

    default: {
      const exhaustive: never = panel;
      return exhaustive;
    }
  }
}

function panelGridClass(layout: PanelsModule["layout"]): string {
  if (layout === 1) return "grid gap-3";
  if (layout === 3) {
    return "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  }
  return "grid gap-3 grid-cols-1 sm:grid-cols-2";
}

function renderPanelsModule(
  module: PanelsModule,
  entitlementKeys: string[],
  memberSummary: PortalMemberSummary | null,
): React.ReactNode {
  const visiblePanels: VisiblePanel[] = [];

  for (const panel of module.panels ?? []) {
    const visiblePanel = resolveVisiblePanel(
      panel,
      entitlementKeys,
      memberSummary,
    );
    if (visiblePanel) visiblePanels.push(visiblePanel);
  }

  if (visiblePanels.length === 0) return null;

  return (
    <div key={module._key} style={{ width: "100%", minWidth: 0 }}>
      {module.title ? (
        <div
          style={{
            fontSize: 15,
            opacity: 0.92,
            marginBottom: 10,
            padding: "0 2px",
          }}
        >
          {module.title}
        </div>
      ) : null}

      <div className={panelGridClass(module.layout)}>
        {visiblePanels.map(renderVisiblePanel)}
      </div>
    </div>
  );
}

function ownsAlbumOffer(albumSlug: string, entitlementKeys: string[]): boolean {
  const offerCfg = getAlbumOffer(albumSlug);
  if (!offerCfg) return false;
  return entitlementKeys.includes(offerCfg.entitlementKey);
}

function renderDownloadGridModule(
  module: DownloadGridModule,
  entitlementKeys: string[],
): React.ReactNode {
  const keyedOffers = addOccurrenceKeys(
    module.offers,
    (offer) => offer.albumSlug,
  );

  return (
    <div
      key={module._key}
      className="portalDownloadGrid2up"
      style={{ minWidth: 0 }}
    >
      {keyedOffers.map(({ key, value: offer }) => (
        <DownloadOfferCard
          key={`${module._key}:${key}`}
          albumSlug={offer.albumSlug}
          owned={ownsAlbumOffer(offer.albumSlug, entitlementKeys)}
          coverImage={offer.coverImage}
          productLabel={offer.productLabel}
          highlights={offer.highlights}
          techSpec={offer.techSpec}
          assets={offer.assets}
        />
      ))}
    </div>
  );
}

function renderDownloadsModule(
  module: DownloadsModule,
  entitlementKeys: string[],
): React.ReactNode {
  return (
    <div
      key={module._key}
      className="portalDownloadGrid2up"
      style={{ minWidth: 0 }}
    >
      <DownloadOfferCard
        albumSlug={module.albumSlug}
        owned={ownsAlbumOffer(module.albumSlug, entitlementKeys)}
        coverImage={module.coverImage}
        productLabel={module.productLabel}
        highlights={module.highlights}
        techSpec={module.techSpec}
        assets={module.assets}
      />
    </div>
  );
}

function renderMemberPanelModule(
  module: MemberPanelModule,
  memberSummary: PortalMemberSummary | null,
): React.ReactNode {
  if (!memberSummary || !hasMeaningfulMemberSummary(memberSummary)) return null;

  return (
    <PortalMemberPanel
      key={module._key}
      summary={memberSummary}
      title={module.title ?? "Member"}
    />
  );
}

function renderModule(
  module: PortalModule,
  entitlementKeys: string[],
  memberSummary: PortalMemberSummary | null,
): React.ReactNode {
  switch (module._type) {
    case "moduleHeading":
      return null;

    case "modulePanels":
      return renderPanelsModule(module, entitlementKeys, memberSummary);

    case "moduleDownloadGrid":
      return renderDownloadGridModule(module, entitlementKeys);

    case "moduleDownloads":
      return renderDownloadsModule(module, entitlementKeys);

    case "moduleArtistPosts":
      return (
        <PortalArtistPosts
          key={module._key}
          title={module.title ?? "Journal"}
          pageSize={module.pageSize ?? 10}
          requireAuthAfter={module.requireAuthAfter ?? 3}
          minVisibility={module.minVisibility ?? "public"}
          authorAvatarSrc="https://www.brendanjohnroch.com/gfx/BJR_posts_avatar.jpeg"
        />
      );

    case "moduleExegesis":
      return <PortalExegesis key={module._key} />;

    case "moduleMemberPanel":
      return renderMemberPanelModule(module, memberSummary);

    default: {
      const exhaustive: never = module;
      return exhaustive;
    }
  }
}

type BuiltTab = {
  id: string;
  title: string;
  locked?: boolean;
  lockedHint?: string | null;
  modules: PortalModule[];
};

type HeadingModule = Extract<PortalModule, { _type: "moduleHeading" }>;

function appendPopulatedTab(tabs: BuiltTab[], current: BuiltTab | null): void {
  if (!current || current.modules.length === 0) return;
  tabs.push(current);
}

function builtTabFromHeading(module: HeadingModule): BuiltTab {
  const title = (module.title ?? "").trim() || "Portal";
  return {
    id: slugify(title) || module._key,
    title,
    locked: false,
    lockedHint: null,
    modules: [],
  };
}

function defaultBuiltTab(): BuiltTab {
  return {
    id: "download",
    title: "Download",
    locked: false,
    lockedHint: null,
    modules: [],
  };
}

function panelRequiresEntitlement(panel: PanelDefinition): boolean {
  return Boolean(panel.requiresEntitlement);
}

function shouldLockTab(tab: BuiltTab, entitlementKeys: string[]): boolean {
  const first = tab.modules[0];
  if (first?._type !== "modulePanels") return false;

  const panels = first.panels ?? [];
  if (panels.length === 0) return false;

  const entitledToAtLeastOne = panels.some((panel) =>
    hasKey(entitlementKeys, panel.requiresEntitlement),
  );
  const allAreGated = panels.every(panelRequiresEntitlement);

  return allAreGated && !entitledToAtLeastOne;
}

function applyTabLockState(tab: BuiltTab, entitlementKeys: string[]): void {
  if (!shouldLockTab(tab, entitlementKeys)) return;
  tab.locked = true;
  tab.lockedHint = "Locked";
}

function inferTabs(
  modules: PortalModule[],
  entitlementKeys: string[],
): BuiltTab[] {
  const tabs: BuiltTab[] = [];
  let current: BuiltTab | null = null;

  for (const portalModule of modules) {
    if (portalModule._type === "moduleHeading") {
      appendPopulatedTab(tabs, current);
      current = builtTabFromHeading(portalModule);
      continue;
    }

    current ??= defaultBuiltTab();
    current.modules.push(portalModule);
  }

  appendPopulatedTab(tabs, current);

  for (const tab of tabs) {
    applyTabLockState(tab, entitlementKeys);
  }

  return tabs;
}

export default function PortalModules(props: Props) {
  const {
    modules,
    entitlementKeys: entitlementKeysInput,
    memberSummary = null,
    isPortalActive,
  } = props;

  const entitlementKeys = expandEntitlementKeys(entitlementKeysInput);

  const tabsBuilt = inferTabs(modules, entitlementKeys);

  const tabs: PortalTabSpec[] = tabsBuilt.map((t) => ({
    id: t.id,
    title: t.title,
    locked: t.locked,
    lockedHint: t.lockedHint,
    content: (
      <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
        {t.modules.map((m) =>
          renderModule(m, entitlementKeys, memberSummary ?? null),
        )}
      </div>
    ),
  }));

  return (
    <PortalTabs
      tabs={tabs}
      defaultTabId={tabs[0]?.id ?? null}
      isPortalActive={isPortalActive}
    />
  );
}