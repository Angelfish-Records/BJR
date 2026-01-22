// web/lib/portal.ts
import type {PortableTextBlock} from '@portabletext/types'
import {client} from '../sanity/lib/client'

export type PortalModuleHeading = {
  _key: string
  _type: 'moduleHeading'
  title: string
  blurb?: string
}

export type PortalModuleRichText = {
  _key: string
  _type: 'moduleRichText'
  title?: string
  teaser?: PortableTextBlock[]
  full?: PortableTextBlock[]
  requiresEntitlement?: string
}

export type PortalModuleCard = {
  _key: string
  title: string
  body?: string
  requiresEntitlement?: string
}

export type PortalModuleCardGrid = {
  _key: string
  _type: 'moduleCardGrid'
  title?: string
  cards: PortalModuleCard[]
}

export type SanityImage = {
  _type: 'image'
  asset: {_ref: string; _type: 'reference'}
  crop?: unknown
  hotspot?: unknown
}

export type PortalDownloadOffer = {
  albumSlug: string
  coverImage?: SanityImage
  productLabel?: string
  teaserCopy?: string
  highlights?: string[]
  techSpec?: string
  giftBlurb?: string
  assets?: Array<{assetId: string; label?: string}>
}

export type PortalModuleDownloadGrid = {
  _key: string
  _type: 'moduleDownloadGrid'
  title?: string
  offers: PortalDownloadOffer[]
}

export type PortalModuleDownloads = {
  _key: string
  _type: 'moduleDownloads'
  title?: string
  albumSlug: string
  teaserCopy?: string
  assets?: Array<{assetId: string; label?: string}>

  // NEW
  coverImage?: SanityImage
  productLabel?: string
  highlights?: string[]
  techSpec?: string
  giftBlurb?: string
}

export type PortalModuleArtistPosts = {
  _key: string
  _type: 'moduleArtistPosts'
  title?: string
  pageSize?: number
  requireAuthAfter?: number
  minVisibility?: 'public' | 'friend' | 'patron' | 'partner'
}


export type PortalModule =
  | PortalModuleHeading
  | PortalModuleRichText
  | PortalModuleCardGrid
  | PortalModuleDownloads
  | PortalModuleDownloadGrid
  | PortalModuleArtistPosts

export type PortalPageDoc = {
  title?: string
  modules?: PortalModule[]
}

const portalPageQuery = `
  *[_type == "portalPage" && slug.current == $slug][0]{
    title,
    modules[]{
      _key,
      _type,

      // moduleHeading
      title,
      blurb,

      // moduleRichText
      teaser,
      full,
      requiresEntitlement,

      // moduleCardGrid
      cards[]{
        _key,
        title,
        body,
        requiresEntitlement
      },

      // moduleDownloads
      albumSlug,
      teaserCopy,
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
        teaserCopy,
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
`


export async function fetchPortalPage(slug: string): Promise<PortalPageDoc | null> {
  return client.fetch<PortalPageDoc | null>(
    portalPageQuery,
    {slug},
    {next: {tags: ['portalPage', `portalPage:${slug}`]}}
  )
}
