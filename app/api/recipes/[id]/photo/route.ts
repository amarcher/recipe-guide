import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { uploadCookLogPhoto } from "@/app/lib/cook-log-photo";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: savedRecipeId } = await ctx.params;

  const familyIds = (
    await prisma.familyMember.findMany({
      where: { userId: user.userId },
      select: { familyId: true },
    })
  ).map((m) => m.familyId);

  const saved = await prisma.savedRecipe.findFirst({
    where: {
      id: savedRecipeId,
      OR: [
        { userId: user.userId, familyId: null },
        ...(familyIds.length ? [{ familyId: { in: familyIds } }] : []),
      ],
    },
  });
  if (!saved) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing photo" }, { status: 400 });
  }

  // Attach to the user's latest CookLog for this recipe; if none, create a
  // zero-cook photo-only log so the library card has a thumbnail without
  // inflating cookCount.
  let target = await prisma.cookLog.findFirst({
    where: { savedRecipeId: saved.id, userId: user.userId },
    orderBy: { cookedAt: "desc" },
  });
  if (!target) {
    target = await prisma.cookLog.create({
      data: {
        savedRecipeId: saved.id,
        userId: user.userId,
        cookedAt: saved.lastCookedAt ?? saved.savedAt,
      },
    });
  }

  try {
    const url = await uploadCookLogPhoto(target.id, file);
    return NextResponse.json({ cookLogId: target.id, photoUrl: url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "upload failed" },
      { status: 400 }
    );
  }
}
