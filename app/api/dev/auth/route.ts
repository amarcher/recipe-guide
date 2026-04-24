import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/app/lib/prisma";

// Dev-only auth bypass for headless agents (browser verification, smoke tests).
// Triple-gated: NODE_ENV must not be production, DEV_AUTH_TOKEN must be set in
// the environment, and the caller must present that token as a Bearer credential.
// If any gate fails the route returns 404 so it is invisible in production-like
// deployments. Only the localhost / HTTP cookie name is set — if you run dev
// over HTTPS, the cookie will be ignored (NextAuth then expects __Secure-…).

export const runtime = "nodejs";

const DEFAULT_EMAIL = "dev@recipe-guide.local";
const COOKIE_NAME = "authjs.session-token";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  const expected = process.env.DEV_AUTH_TOKEN;
  if (!expected) {
    return new NextResponse("Not found", { status: 404 });
  }
  const presented = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!presented || presented !== expected) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: { email?: string } = {};
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    // empty / non-JSON body is fine — fall back to DEFAULT_EMAIL
  }
  const email = (body.email ?? DEFAULT_EMAIL).trim().toLowerCase();
  if (!email.includes("@")) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: email.split("@")[0] },
  });

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires },
  });

  const res = NextResponse.json({
    ok: true,
    userId: user.id,
    email,
    expires: expires.toISOString(),
  });
  res.cookies.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    expires,
  });
  return res;
}
