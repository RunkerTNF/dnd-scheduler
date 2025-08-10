// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const isAuth = !!token;

  // Защищаем только страницы под /groups
  const isProtected = req.nextUrl.pathname.startsWith("/groups");

  if (!isAuth && isProtected) {
    const url = new URL("/signin", req.url);
    url.searchParams.set(
      "callbackUrl",
      req.nextUrl.pathname + req.nextUrl.search
    );
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // только страницы, не API и не статика
    "/groups/:path*",
  ],
};
