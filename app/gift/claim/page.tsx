// web/app/gift/claim/page.tsx
import 'server-only'
import {redirect} from 'next/navigation'

export const runtime = 'nodejs'

function safeStr(v: unknown): string {
  return (typeof v === 'string' ? v : '').trim()
}

export default function GiftClaimRedirectPage(props: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const gRaw = props.searchParams?.g
  const cRaw = props.searchParams?.c

  const giftId = safeStr(Array.isArray(gRaw) ? gRaw[0] : gRaw)
  const claimCode = safeStr(Array.isArray(cRaw) ? cRaw[0] : cRaw)

  // Always land them in the main site/feed; params ride along.
  // Your home shell will attempt claim if both params exist.
  const qs =
    giftId && claimCode
      ? `?giftClaim=1&g=${encodeURIComponent(giftId)}&c=${encodeURIComponent(claimCode)}`
      : `?giftClaim=missing`

  redirect(`/home${qs}`)
}
