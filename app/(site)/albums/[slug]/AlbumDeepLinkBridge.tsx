// web/app/(site)/albums/[slug]/AlbumDeepLinkBridge.tsx
'use client'

import React from 'react'
import {useParams, useSearchParams, useRouter, usePathname} from 'next/navigation'

export default function AlbumDeepLinkBridge() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams<{slug: string}>()
  const sp = useSearchParams()

  React.useEffect(() => {
    // paranoia: never redirect if we’re already on /home
    if (pathname?.startsWith('/home')) return

    const slug = params?.slug
    if (!slug) return

    const t = sp.get('t') // existing share param
    const next = new URLSearchParams()
    next.set('p', 'player')
    next.set('album', slug)
    if (t) next.set('track', t)

    router.replace(`/home?${next.toString()}`)
  }, [router, pathname, params?.slug, sp])

  return null
}
