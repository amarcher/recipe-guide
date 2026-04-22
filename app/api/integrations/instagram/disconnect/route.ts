import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

// Disconnect wipes the token + account link. Imported recipes stay in the
// library (they're real SavedRecipe rows now); InstagramPost rows cascade
// away via the FK.
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await prisma.instagramConnection.deleteMany({
    where: { userId: user.userId },
  });
  return NextResponse.json({ ok: true });
}
