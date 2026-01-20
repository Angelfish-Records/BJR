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

export type PortalModuleDownloads = {
  _key: string
  _type: 'moduleDownloads'
  title?: string
  albumSlug: string
  teaserCopy?: string
  assets?: Array<{assetId: string; label?: string}>
}

export type PortalModule =
  | PortalModuleHeading
  | PortalModuleRichText
  | PortalModuleCardGrid
  | PortalModuleDownloads

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
      assets[]{assetId, label}
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
