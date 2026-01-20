// web/app/admin/share-tokens/page.tsx
import 'server-only'
import {redirect} from 'next/navigation'

export default async function Page(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = (await props.searchParams) ?? {}
  const qs = new URLSearchParams()

  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && v.trim()) qs.set(k, v)
    else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string' && item.trim()) qs.append(k, item)
      }
    }
  }

  const suffix = qs.toString()
  redirect(`/admin/access${suffix ? `?${suffix}` : ''}`)
}
