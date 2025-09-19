import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const isAuth = !!req.nextauth.token
    const isHomePage = req.nextUrl.pathname === '/home'
    const isRootPage = req.nextUrl.pathname === '/'

    // If user is authenticated and trying to access root page, redirect to home
    if (isAuth && isRootPage) {
      return NextResponse.redirect(new URL('/home', req.url))
    }

    // If user is not authenticated and trying to access home page, redirect to root
    if (!isAuth && isHomePage) {
      return NextResponse.redirect(new URL('/', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: () => true, // Allow all requests, we'll handle auth in the middleware
    },
  }
)

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}