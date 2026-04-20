import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

async function ensureAccess(userId: string, recipeId: string): Promise<boolean> {
  const familyIds = (
    await prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    })
  ).map((m) => m.familyId);
  const r = await prisma.savedRecipe.findFirst({
    where: {
      id: recipeId,
      OR: [
        { userId, familyId: null },
        ...(familyIds.length ? [{ familyId: { in: familyIds } }] : []),
      ],
    },
    select: { id: true },
  });
  return !!r;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await ensureAccess(user.userId, id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const checks = await prisma.miseCheck.findMany({
    where: { savedRecipeId: id, userId: user.userId },
    select: { entryKey: true },
  });
  return NextResponse.json({ checked: checks.map((c) => c.entryKey) });
}

// Body: { entryKey: string, checked: boolean }
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await ensureAccess(user.userId, id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { entryKey?: string; checked?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.entryKey)
    return NextResponse.json({ error: "missing entryKey" }, { status: 400 });

  if (body.checked) {
    await prisma.miseCheck.upsert({
      where: {
        savedRecipeId_userId_entryKey: {
          savedRecipeId: id,
          userId: user.userId,
          entryKey: body.entryKey,
        },
      },
      create: {
        savedRecipeId: id,
        userId: user.userId,
        entryKey: body.entryKey,
      },
      update: {},
    });
  } else {
    await prisma.miseCheck.deleteMany({
      where: {
        savedRecipeId: id,
        userId: user.userId,
        entryKey: body.entryKey,
      },
    });
  }
  return NextResponse.json({ ok: true });
}

// Clear all mise checks for the current user on this recipe.
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await ensureAccess(user.userId, id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.miseCheck.deleteMany({
    where: { savedRecipeId: id, userId: user.userId },
  });
  return NextResponse.json({ ok: true });
}
