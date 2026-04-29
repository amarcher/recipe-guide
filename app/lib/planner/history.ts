// PLANNER: canonical-only. Reads ParsedRecipe.cardJson via loadCanonicalCard;
// never resolveCard. See app/lib/card-resolver.ts banner.
import { prisma } from "@/app/lib/prisma";
import { loadCanonicalCard } from "@/app/lib/card-resolver";
import type { CookCard } from "@/app/types";

export type RecentRecipe = {
  title: string;
  cookCount: number;
  lastCookedAt: string | null;
  daysSinceCooked: number | null;
  heroIngredientSlugs: string[];
};

export async function loadRecentRecipes(
  userId: string,
  familyId: string | null,
  limit = 25
): Promise<RecentRecipe[]> {
  const familyIds = familyId
    ? [familyId]
    : (
        await prisma.familyMember.findMany({
          where: { userId },
          select: { familyId: true },
        })
      ).map((m) => m.familyId);

  const rows = await prisma.savedRecipe.findMany({
    where: {
      OR: [
        { userId, familyId: null },
        ...(familyIds.length ? [{ familyId: { in: familyIds } }] : []),
      ],
    },
    include: { parsedRecipe: true },
    orderBy: [{ lastCookedAt: "desc" }, { savedAt: "desc" }],
    take: limit,
  });

  const now = Date.now();
  return rows.map((r) => {
    const last = r.lastCookedAt?.getTime() ?? null;
    const card: CookCard | null = r.parsedRecipe.cardJson
      ? loadCanonicalCard(r.parsedRecipe)
      : null;
    const slugs = new Set<string>();
    if (card) {
      for (const ing of card.pantry_ingredients ?? []) {
        if (ing.item) slugs.add(ing.item.toLowerCase());
      }
      for (const s of card.steps ?? []) {
        for (const ing of s.ingredients ?? []) {
          if (ing.item) slugs.add(ing.item.toLowerCase());
        }
      }
    }
    return {
      title: r.parsedRecipe.title,
      cookCount: r.cookCount,
      lastCookedAt: last ? new Date(last).toISOString().slice(0, 10) : null,
      daysSinceCooked: last ? Math.floor((now - last) / (24 * 60 * 60 * 1000)) : null,
      heroIngredientSlugs: [...slugs].slice(0, 8),
    };
  });
}
