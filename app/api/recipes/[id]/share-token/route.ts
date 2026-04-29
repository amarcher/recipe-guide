import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { randomToken } from "@/app/lib/slug";
import { notify } from "@/app/lib/notifications";

export const runtime = "nodejs";

// Roadmap item 2.20 — public recipe share token. Owner/family create an
// opaque token for /r/[token]; we never modify requireUser() on the
// existing /api/recipes/[id] route per the constraint. Tokens are
// per-creator + per-recipe, dedup by latest active.

async function canCreateShare(
  userId: string,
  saved: { userId: string; familyId: string | null },
): Promise<boolean> {
  if (saved.familyId === null) return saved.userId === userId;
  const member = await prisma.familyMember.findUnique({
    where: { userId_familyId: { userId, familyId: saved.familyId } },
  });
  return !!member;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const saved = await prisma.savedRecipe.findUnique({ where: { id } });
  if (!saved) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canCreateShare(user.userId, saved))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const tokens = await prisma.recipeShareToken.findMany({
    where: { savedRecipeId: id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    tokens: tokens.map((t) => ({
      id: t.id,
      token: t.token,
      createdAt: t.createdAt.getTime(),
      expiresAt: t.expiresAt?.getTime() ?? null,
      viewCount: t.viewCount,
    })),
  });
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const saved = await prisma.savedRecipe.findUnique({ where: { id } });
  if (!saved) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canCreateShare(user.userId, saved))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Reuse the most recent active token for the same (user, recipe) — saves
  // the recipient from getting flooded by re-shares of the same dish, and
  // collapses post-cook chip taps onto one URL.
  const existing = await prisma.recipeShareToken.findFirst({
    where: {
      savedRecipeId: id,
      createdById: user.userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return NextResponse.json({
      id: existing.id,
      token: existing.token,
      alreadyExisted: true,
    });
  }

  const created = await prisma.recipeShareToken.create({
    data: {
      savedRecipeId: id,
      token: randomToken(16),
      createdById: user.userId,
    },
  });
  await notify({
    userId: user.userId,
    type: "recipe.share.created",
    payload: {
      savedRecipeId: id,
      token: created.token,
    },
    actorUserId: user.userId,
  });
  return NextResponse.json({
    id: created.id,
    token: created.token,
    alreadyExisted: false,
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const saved = await prisma.savedRecipe.findUnique({ where: { id } });
  if (!saved) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canCreateShare(user.userId, saved))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const tokenId = url.searchParams.get("id");
  if (!tokenId) return NextResponse.json({ error: "missing id" }, { status: 400 });

  await prisma.recipeShareToken.updateMany({
    where: { id: tokenId, savedRecipeId: id },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
