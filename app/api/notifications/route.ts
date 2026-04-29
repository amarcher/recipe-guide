import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

// Roadmap item 2.21 — list + mark-as-read for the user's notifications.
//
// GET: returns the most recent ~50 notifications + unreadCount.
// PATCH: { ids?: string[], all?: true } marks rows as read.

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        actorUser: { select: { id: true, name: true, image: true } },
      },
    }),
    prisma.notification.count({
      where: { userId: user.userId, readAt: null },
    }),
  ]);

  return NextResponse.json({
    unreadCount,
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      payload: n.payload,
      readAt: n.readAt?.getTime() ?? null,
      createdAt: n.createdAt.getTime(),
      actor: n.actorUser
        ? {
            id: n.actorUser.id,
            name: n.actorUser.name,
            image: n.actorUser.image,
          }
        : null,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { ids?: string[]; all?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (body.all) {
    await prisma.notification.updateMany({
      where: { userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await prisma.notification.updateMany({
      where: { userId: user.userId, id: { in: body.ids } },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "missing ids or all" }, { status: 400 });
}
