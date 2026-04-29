import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

// Roadmap item 2.14 — config blob for the Meezing presence ribbon. Returns
// `{ enabled, familyId, members }` so the SaveBar can decide whether to
// mount <MeezingRibbon /> without an extra round-trip to fetch family info.
//
// Returns enabled:false (with no family / members) for personal-scope
// recipes, family-scope recipes whose family has syncExecution off, or
// recipes the viewer doesn't have access to.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const saved = await prisma.savedRecipe.findUnique({
    where: { id },
    select: {
      familyId: true,
      family: {
        select: {
          id: true,
          syncExecution: true,
          members: {
            select: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
  });
  if (!saved?.familyId || !saved.family?.syncExecution) {
    return NextResponse.json({ enabled: false });
  }
  // Confirm the viewer is a member of this family.
  const member = await prisma.familyMember.findUnique({
    where: {
      userId_familyId: { userId: user.userId, familyId: saved.familyId },
    },
    select: { userId: true },
  });
  if (!member) {
    return NextResponse.json({ enabled: false });
  }
  return NextResponse.json({
    enabled: true,
    familyId: saved.familyId,
    members: saved.family.members
      .map((m) => m.user)
      .filter((u) => u.id !== user.userId),
  });
}
