import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { resolveCard } from "@/app/lib/card-resolver";

export const runtime = "nodejs";

// Roadmap item 2.20 — anonymous read for a token-shared recipe. Mirrors
// the guest-branch payload of /api/recipes/[id] (override-applied card,
// no cookHistory, no per-user fields). Public — no auth wall.
//
// Bumps viewCount opportunistically on each fetch.

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const t = await prisma.recipeShareToken.findUnique({
    where: { token },
    include: {
      savedRecipe: {
        include: {
          parsedRecipe: true,
          family: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!t || t.revokedAt) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (t.expiresAt && t.expiresAt < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const resolved = await resolveCard(t.savedRecipe);

  // Best-effort view counter — failures here don't break the read.
  try {
    await prisma.recipeShareToken.update({
      where: { id: t.id },
      data: { viewCount: { increment: 1 } },
    });
  } catch {}

  return NextResponse.json({
    id: t.savedRecipe.id,
    sourceUrl: t.savedRecipe.parsedRecipe.sourceUrl,
    title: resolved.card.title ?? t.savedRecipe.parsedRecipe.title,
    card: resolved.card,
    family: t.savedRecipe.family,
    viewerAccess: "guest" as const,
    cookHistory: [],
    cookCount: 0,
    lastCookedAt: null,
  });
}
