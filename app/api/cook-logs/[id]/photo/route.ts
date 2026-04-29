import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { uploadCookLogPhoto } from "@/app/lib/cook-log-photo";
import { recordFamilyEvent } from "@/app/lib/family-events";
import { notifyFamily } from "@/app/lib/notifications";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const log = await prisma.cookLog.findUnique({
    where: { id },
    include: { savedRecipe: { select: { userId: true, familyId: true } } },
  });
  if (!log) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isOwner = log.userId === user.userId;
  let isFamilyMember = false;
  if (!isOwner && log.savedRecipe.familyId) {
    const m = await prisma.familyMember.findUnique({
      where: {
        userId_familyId: {
          userId: user.userId,
          familyId: log.savedRecipe.familyId,
        },
      },
    });
    isFamilyMember = !!m;
  }
  if (!isOwner && !isFamilyMember) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing photo" }, { status: 400 });
  }

  try {
    const url = await uploadCookLogPhoto(id, file);
    // Roadmap items 2.13 + 2.21 — fan out the photo upload to family
    // members. Best-effort; failures don't block the response.
    if (log.savedRecipe.familyId) {
      const payload = {
        cookLogId: id,
        savedRecipeId: log.savedRecipeId,
        photoUrl: url,
      };
      await recordFamilyEvent({
        familyId: log.savedRecipe.familyId,
        kind: "cook.photo.uploaded",
        savedRecipeId: log.savedRecipeId,
        payload,
        actorId: user.userId,
      });
      await notifyFamily(
        log.savedRecipe.familyId,
        "cook.photo.uploaded",
        payload,
        user.userId,
      );
    }
    return NextResponse.json({ photoUrl: url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "upload failed" },
      { status: 400 }
    );
  }
}
