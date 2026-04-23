import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import type { CookCard } from "@/app/types";

export const runtime = "nodejs";

// List all recipes saved by the current user (personal + every family they're
// a member of). Returns lean rows for the library list.
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const families = await prisma.familyMember.findMany({
    where: { userId: user.userId },
    select: { familyId: true },
  });
  const familyIds = families.map((f) => f.familyId);

  const rows = await prisma.savedRecipe.findMany({
    where: {
      OR: [
        { userId: user.userId, familyId: null },
        ...(familyIds.length
          ? [{ familyId: { in: familyIds } }]
          : []),
      ],
    },
    include: {
      parsedRecipe: {
        select: { sourceUrl: true, title: true, cardJson: true },
      },
      family: { select: { id: true, name: true } },
      cookLogs: {
        where: { photoUrl: { not: null } },
        orderBy: { photoUploadedAt: "desc" },
        take: 1,
        select: {
          photoUrl: true,
          photoUploadedAt: true,
          videoUrl: true,
          videoAspectRatio: true,
          instagramPostId: true,
        },
      },
    },
    orderBy: [{ lastCookedAt: "desc" }, { savedAt: "desc" }],
  });

  // IG-imported media is recipe-level (it's the canonical hero for the recipe,
  // not a record of a particular cook event), so it should follow the
  // ParsedRecipe across scopes. When a SavedRecipe row has no CookLogs of its
  // own (e.g. a family scope the importer bulk-added), fall back to the best
  // IG-origin CookLog from any SavedRecipe pointing at the same ParsedRecipe.
  // Scoped narrowly to IG logs — personal cook-session photos stay personal.
  const parsedIds = rows.map((r) => r.parsedRecipeId);
  const igFallbackLogs = parsedIds.length
    ? await prisma.cookLog.findMany({
        where: {
          savedRecipe: { parsedRecipeId: { in: parsedIds } },
          instagramPostId: { not: null },
          photoUrl: { not: null },
        },
        orderBy: { photoUploadedAt: "desc" },
        select: {
          photoUrl: true,
          videoUrl: true,
          videoAspectRatio: true,
          instagramPostId: true,
          savedRecipe: { select: { parsedRecipeId: true } },
        },
      })
    : [];

  const bestIgByParsed = new Map<string, (typeof igFallbackLogs)[number]>();
  for (const log of igFallbackLogs) {
    const pid = log.savedRecipe.parsedRecipeId;
    if (!bestIgByParsed.has(pid)) bestIgByParsed.set(pid, log);
  }

  return NextResponse.json({
    recipes: rows.map((r) => {
      const own = r.cookLogs[0];
      const ig = bestIgByParsed.get(r.parsedRecipeId);
      // Prefer the viewer's own cook-session media (personal, up-to-date
      // photo of the dish they actually made); fall back to the recipe's
      // IG-level media otherwise.
      const photoUrl = own?.photoUrl ?? ig?.photoUrl ?? null;
      const videoUrl = own?.videoUrl ?? ig?.videoUrl ?? null;
      const videoAspectRatio =
        own?.videoAspectRatio ?? ig?.videoAspectRatio ?? null;
      const fromInstagram =
        !!own?.instagramPostId || !!ig?.instagramPostId;
      return {
        id: r.id,
        sourceUrl: r.parsedRecipe.sourceUrl,
        title: r.parsedRecipe.title,
        card: r.parsedRecipe.cardJson as unknown as CookCard,
        family: r.family,
        savedAt: r.savedAt.getTime(),
        lastCookedAt: r.lastCookedAt?.getTime() ?? null,
        cookCount: r.cookCount,
        photoUrl,
        videoUrl,
        videoAspectRatio,
        fromInstagram,
      };
    }),
  });
}

// Save a recipe (parsed already, we just persist the link).
// Body: { card: CookCard, familyId?: string | null }
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let card: CookCard | null = null;
  let familyId: string | null = null;
  try {
    const body = await req.json();
    card = body?.card ?? null;
    familyId = body?.familyId ?? null;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!card?.source_url || !card.title) {
    return NextResponse.json({ error: "missing card fields" }, { status: 400 });
  }

  // Make sure the parsed recipe is in the cache (it should be — /api/parse
  // populates it — but be defensive).
  const parsed = await prisma.parsedRecipe.upsert({
    where: { sourceUrl: card.source_url },
    create: {
      sourceUrl: card.source_url,
      title: card.title,
      cardJson: card as unknown as object,
      modelUsed: "client-side-save",
    },
    update: {},
  });

  // If saving to a family, verify membership.
  if (familyId) {
    const m = await prisma.familyMember.findUnique({
      where: { userId_familyId: { userId: user.userId, familyId } },
    });
    if (!m) return NextResponse.json({ error: "not a member of that family" }, { status: 403 });
  }

  // Postgres treats NULLs as distinct in unique constraints, so we can't rely
  // on the @@unique to dedupe personal-scope saves. Hand-roll the upsert.
  const existing = await prisma.savedRecipe.findFirst({
    where: { userId: user.userId, parsedRecipeId: parsed.id, familyId },
  });
  const saved =
    existing ??
    (await prisma.savedRecipe.create({
      data: {
        userId: user.userId,
        parsedRecipeId: parsed.id,
        familyId,
      },
    }));

  return NextResponse.json({ id: saved.id });
}
