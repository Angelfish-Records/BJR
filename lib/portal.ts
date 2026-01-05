// web/lib/portal.ts
import type {PortableTextBlock} from '@portabletext/types'
import {client} from '../sanity/lib/client'

export type PortalModuleRichText = {
  _key: string
  _type: 'moduleRichText'
  title?: string
  teaser?: PortableTextBlock[]
  full?: PortableTextBlock[]
  /** Single entitlement key required to see full content (schema v1) */
  requiresEntitlement?: string
}

export type PortalModule = PortalModuleRichText

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
      title,
      teaser,
      full,
      requiresEntitlement
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
