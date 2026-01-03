// web/middleware.ts
import {clerkMiddleware, createRouteMatcher} from '@clerk/nextjs/server'
import {NextResponse} from 'next/server'

const isProtectedRoute = createRouteMatcher(['/home(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (!isProtectedRoute(req)) return NextResponse.next()

  const {userId} = await auth()
  if (!userId) {
    // Clerk will handle /sign-in route if you've configured it; otherwise adjust.
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
}
