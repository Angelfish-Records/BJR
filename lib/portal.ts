// web/lib/portal.ts
import type {PortableTextBlock} from '@portabletext/types'
import {client} from '../sanity/lib/client'

export type PortalModuleRichText = {
  _key: string
  _type: 'moduleRichText'
  title?: string
  teaser?: PortableTextBlock[]
  full?: PortableTextBlock[]
  requiresEntitlement?: string
}

export type PortalPageDoc = {
  title?: string
  modules?: PortalModuleRichText[]
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

export async function fetchPortalPage(slug: string) {
  return client.fetch<PortalPageDoc>(
    portalPageQuery,
    {slug},
    {next: {tags: ['portalPage', `portalPage:${slug}`]}}
  )
}
