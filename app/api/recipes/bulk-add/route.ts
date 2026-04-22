import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

// Copy a batch of SavedRecipe rows into a family scope for the current user.
// Each input id points at an existing SavedRecipe (any scope the user already
// has access to); we resolve to the underlying ParsedRecipe and create — if
// missing — a new SavedRecipe(userId, parsedRecipeId, familyId) row.
//
// Dedupe note: Postgres treats NULL as distinct in unique constraints, but
// familyId here is non-null, so the composite @@unique on
// (userId, parsedRecipeId, familyId) catches repeats cleanly.
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let savedRecipeIds: string[] = [];
  let familyId = "";
  try {
    const body = await req.json();
    savedRecipeIds = Array.isArray(body?.savedRecipeIds)
      ? body.savedRecipeIds.filter((x: unknown) => typeof x === "string")
      : [];
    familyId = typeof body?.familyId === "string" ? body.familyId : "";
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!familyId || savedRecipeIds.length === 0) {
    return NextResponse.json(
      { error: "need savedRecipeIds and familyId" },
      { status: 400 }
    );
  }

  const membership = await prisma.familyMember.findUnique({
    where: { userId_familyId: { userId: user.userId, familyId } },
  });
  if (!membership) {
    return NextResponse.json(
      { error: "not a member of that family" },
      { status: 403 }
    );
  }

  // Find all SavedRecipes the user can actually see, then resolve to
  // underlying ParsedRecipe ids.
  const myFamilyIds = (
    await prisma.familyMember.findMany({
      where: { userId: user.userId },
      select: { familyId: true },
    })
  ).map((m) => m.familyId);

  const source = await prisma.savedRecipe.findMany({
    where: {
      id: { in: savedRecipeIds },
      OR: [
        { userId: user.userId, familyId: null },
        ...(myFamilyIds.length ? [{ familyId: { in: myFamilyIds } }] : []),
      ],
    },
    select: { parsedRecipeId: true },
  });
  const uniqueParsedIds = [...new Set(source.map((r) => r.parsedRecipeId))];

  if (uniqueParsedIds.length === 0) {
    return NextResponse.json({ added: 0, alreadyThere: 0 });
  }

  // Which of those are already saved in this family?
  const existing = await prisma.savedRecipe.findMany({
    where: {
      userId: user.userId,
      familyId,
      parsedRecipeId: { in: uniqueParsedIds },
    },
    select: { parsedRecipeId: true },
  });
  const alreadyIds = new Set(existing.map((r) => r.parsedRecipeId));
  const toCreate = uniqueParsedIds.filter((id) => !alreadyIds.has(id));

  if (toCreate.length > 0) {
    await prisma.savedRecipe.createMany({
      data: toCreate.map((parsedRecipeId) => ({
        userId: user.userId,
        parsedRecipeId,
        familyId,
      })),
    });
  }

  return NextResponse.json({
    added: toCreate.length,
    alreadyThere: alreadyIds.size,
  });
}
