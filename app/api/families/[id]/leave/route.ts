import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const me = await prisma.familyMember.findUnique({
    where: { userId_familyId: { userId: user.userId, familyId: id } },
  });
  if (!me) return NextResponse.json({ error: "not a member" }, { status: 404 });

  // If you're the only owner, you can't leave — you'd orphan the family.
  if (me.role === "OWNER") {
    const otherOwners = await prisma.familyMember.count({
      where: { familyId: id, role: "OWNER", NOT: { userId: user.userId } },
    });
    if (otherOwners === 0) {
      return NextResponse.json(
        {
          error:
            "You're the sole owner — promote someone else or delete the family.",
        },
        { status: 409 }
      );
    }
  }

  await prisma.familyMember.delete({
    where: { userId_familyId: { userId: user.userId, familyId: id } },
  });
  return NextResponse.json({ ok: true });
}
