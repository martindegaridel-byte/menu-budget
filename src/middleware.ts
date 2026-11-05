import { NextResponse, type NextRequest } from "next/server";

export const USER_COOKIE = "mb_uid";

/** Attribue un identifiant anonyme (en attendant les comptes utilisateur). */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get(USER_COOKIE)) {
    const id = crypto.randomUUID();
    req.cookies.set(USER_COOKIE, id);
    res.cookies.set(USER_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365 * 2,
      path: "/",
    });
    // Rend le cookie visible dès cette requête côté serveur.
    const headers = new Headers(req.headers);
    headers.set("cookie", req.cookies.toString());
    const forwarded = NextResponse.next({ request: { headers } });
    res.cookies.getAll().forEach((c) => forwarded.cookies.set(c));
    return forwarded;
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"] };
