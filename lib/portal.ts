// web/lib/portal.ts
import type { PortableTextBlock } from "@portabletext/types";
import { client } from "../sanity/lib/client";

export type PortalModuleHeading = {
  _key: string;
  _type: "moduleHeading";
  title: string;
  blurb?: string;
};

export type PanelStyleVariant = "default" | "gold" | "patternPill";

export type PortalModulePanel = {
  _key: string;
  title: string;
  teaser?: PortableTextBlock[];
  full?: PortableTextBlock[];
  requiresEntitlement?: string;
  styleVariant?: PanelStyleVariant;
};

export type PortalModulePanels = {
  _key: string;
  _type: "modulePanels";
  title?: string;
  layout?: 1 | 2 | 3;
  panels: PortalModulePanel[];
};

export type SanityImage = {
  _type: "image";
  asset: { _ref: string; _type: "reference" };
  crop?: unknown;
  hotspot?: unknown;
};

export type PortalDownloadOffer = {
  albumSlug: string;
  coverImage?: SanityImage;
  productLabel?: string;
  highlights?: string[];
  techSpec?: string;
  giftBlurb?: string;
  assets?: Array<{ assetId: string; label?: string }>;
};

export type PortalModuleDownloadGrid = {
  _key: string;
  _type: "moduleDownloadGrid";
  title?: string;
  offers: PortalDownloadOffer[];
};

export type PortalModuleDownloads = {
  _key: string;
  _type: "moduleDownloads";
  title?: string;
  albumSlug: string;
  assets?: Array<{ assetId: string; label?: string }>;

  // NEW
  coverImage?: SanityImage;
  productLabel?: string;
  highlights?: string[];
  techSpec?: string;
  giftBlurb?: string;
};

export type PortalModuleArtistPosts = {
  _key: string;
  _type: "moduleArtistPosts";
  title?: string;
  pageSize?: number;
  requireAuthAfter?: number;
  minVisibility?: "public" | "friend" | "patron" | "partner";
};

export type PortalModule =
  | PortalModuleHeading
  | PortalModulePanels
  | PortalModuleDownloads
  | PortalModuleDownloadGrid
  | PortalModuleArtistPosts;

export type PortalPageDoc = {
  title?: string;
  modules?: PortalModule[];
};

const portalPageQuery = `
  *[_type == "portalPage" && slug.current == $slug][0]{
    title,
    modules[]{
      _key,
      _type,

      // moduleHeading
      title,
      blurb,

      // modulePanels
      layout,
      panels[]{
        _key,
        title,
        teaser,
        full,
        requiresEntitlement
        styleVariant
      },

      // moduleDownloads
      albumSlug,
      assets[]{assetId, label},
      coverImage,
      productLabel,
      highlights,
      techSpec,
      giftBlurb,

      // moduleDownloadGrid
      offers[]{
        albumSlug,
        coverImage,
        productLabel,
        highlights,
        techSpec,
        giftBlurb,
        assets[]{assetId, label}
      },


      // moduleArtistPosts
      pageSize,
      requireAuthAfter,
      minVisibility
    }
  }
`;

export async function fetchPortalPage(
  slug: string,
): Promise<PortalPageDoc | null> {
  return client.fetch<PortalPageDoc | null>(
    portalPageQuery,
    { slug },
    { next: { tags: ["portalPage", `portalPage:${slug}`] } },
  );
}
