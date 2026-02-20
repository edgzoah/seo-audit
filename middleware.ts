import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = new Set<string>(["/", "/login", "/register", "/landing"]);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/landing/");
}

function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml")
  );
}

function isPublicApi(pathname: string): boolean {
  return pathname.startsWith("/api/auth");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  if (isPublicAsset(pathname) || isPublicApi(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const protectedAppRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/audits") ||
    pathname.startsWith("/compare") ||
    pathname.startsWith("/new");
  const protectedApiRoute = pathname.startsWith("/api/runs") || pathname.startsWith("/api/audits/run");

  if (!protectedAppRoute && !protectedApiRoute) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (token?.sub) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (protectedApiRoute) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/:path*"],
};
