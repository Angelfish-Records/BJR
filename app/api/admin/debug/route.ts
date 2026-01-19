// web/app/api/admin/debug/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {requireAdminMemberId} from '@/lib/adminAuth'

type DebugState = {
  // view tier for UI (optional)
  tier?: 'none' | 'friend' | 'patron' | 'partner' | 'real'
  // force access check result (optional)
  force?: 'none' | 'AUTH_REQUIRED' | 'ENTITLEMENT_REQUIRED' | 'ANON_CAP_REACHED' | 'EMBARGOED'
}

const COOKIE = 'af_dbg'
const ENABLED = process.env.NEXT_PUBLIC_ADMIN_DEBUG === '1'

export async function POST(req: Request) {
  try {
    await requireAdminMemberId()
    if (!ENABLED) return NextResponse.json({ok: false, error: 'Debug disabled'}, {status: 400})

    const raw: unknown = await req.json().catch(() => null)
    const state = (raw ?? {}) as DebugState

    const v = JSON.stringify({
      tier: state.tier ?? 'real',
      force: state.force ?? 'none',
    })

    const res = NextResponse.json({ok: true})
    res.cookies.set(COOKIE, v, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 6,
    })
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return NextResponse.json({ok: false, error: msg}, {status: 401})
  }
}

export async function DELETE() {
  try {
    await requireAdminMemberId()
    const res = NextResponse.json({ok: true})
    res.cookies.set(COOKIE, '', {httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0})
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return NextResponse.json({ok: false, error: msg}, {status: 401})
  }
}
