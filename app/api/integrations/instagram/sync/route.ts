import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { syncConnection } from "@/app/lib/instagram/sync";

export const runtime = "nodejs";
// A full sync with media rehosting + reconstruction can take a while when
// there are many new posts. Give it enough headroom.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const connection = await prisma.instagramConnection.findUnique({
    where: { userId: user.userId },
  });
  if (!connection) {
    return NextResponse.json(
      { error: "no Instagram connection — paste an access token first" },
      { status: 400 }
    );
  }

  let maxPosts: number | undefined;
  let force = false;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.maxPosts === "number") maxPosts = body.maxPosts;
    if (body?.force === true) force = true;
  } catch {}

  try {
    const outcome = await syncConnection(connection.id, { maxPosts, force });
    return NextResponse.json(outcome);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await prisma.instagramConnection.update({
      where: { id: connection.id },
      data: { lastSyncError: msg },
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
