import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { fetchMyAccount } from "@/app/lib/instagram/client";

export const runtime = "nodejs";

// Dev/bootstrap endpoint. The user pastes a short- or long-lived IG access
// token (generated in Graph API Explorer or via the phase-3 OAuth flow) and
// we verify it by fetching /me, then store the connection. Real OAuth with
// automatic token refresh lands in phase 3.
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let accessToken: string;
  let expiresInSeconds: number | undefined;
  try {
    const body = await req.json();
    accessToken = String(body?.accessToken ?? "").trim();
    expiresInSeconds =
      typeof body?.expiresIn === "number" ? body.expiresIn : undefined;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: "missing accessToken" }, { status: 400 });
  }

  let account: { id: string; username: string };
  try {
    account = await fetchMyAccount(accessToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { error: `token rejected by Instagram: ${msg}` },
      { status: 400 }
    );
  }

  const tokenExpiresAt =
    expiresInSeconds != null
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : null;

  const connection = await prisma.instagramConnection.upsert({
    where: { userId: user.userId },
    create: {
      userId: user.userId,
      instagramAccountId: account.id,
      username: account.username,
      accessToken,
      tokenExpiresAt,
    },
    update: {
      instagramAccountId: account.id,
      username: account.username,
      accessToken,
      tokenExpiresAt,
      lastSyncError: null,
    },
  });

  return NextResponse.json({
    id: connection.id,
    username: connection.username,
    tokenExpiresAt: connection.tokenExpiresAt,
  });
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const connection = await prisma.instagramConnection.findUnique({
    where: { userId: user.userId },
    select: {
      id: true,
      username: true,
      tokenExpiresAt: true,
      lastSyncedAt: true,
      lastSyncError: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
  });

  if (!connection) return NextResponse.json({ connection: null });

  const posts = await prisma.instagramPost.findMany({
    where: { connectionId: connection.id },
    orderBy: { postedAt: "desc" },
    take: 20,
    select: {
      postId: true,
      permalink: true,
      postedAt: true,
      mediaType: true,
      caption: true,
      processedAt: true,
      processingError: true,
      savedRecipeId: true,
      thumbnailBlobUrl: true,
    },
  });

  const [importedCount, errorCount] = await Promise.all([
    prisma.instagramPost.count({
      where: { connectionId: connection.id, processedAt: { not: null } },
    }),
    prisma.instagramPost.count({
      where: {
        connectionId: connection.id,
        processedAt: null,
        processingError: { not: null },
      },
    }),
  ]);

  return NextResponse.json({
    connection,
    counts: { imported: importedCount, errored: errorCount },
    posts: posts.map((p) => ({
      postId: p.postId,
      permalink: p.permalink,
      postedAt: p.postedAt,
      mediaType: p.mediaType,
      caption: p.caption?.slice(0, 140) ?? null,
      processedAt: p.processedAt,
      processingError: p.processingError,
      savedRecipeId: p.savedRecipeId,
      thumbnailBlobUrl: p.thumbnailBlobUrl,
    })),
  });
}
