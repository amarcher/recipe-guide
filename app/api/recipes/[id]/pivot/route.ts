import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { resolveCard } from "@/app/lib/card-resolver";
import { runPivot } from "@/app/lib/pivot/run";
import type { PivotMeta } from "@/app/lib/pivot/meta";

export const runtime = "nodejs";
export const maxDuration = 120;

// "Stuck? Adapt the recipe." Mid-cook escape hatch — the cook tells the
// model what went wrong, and we produce a minimally-deviated revised
// recipe forked into their personal library, marked as a pivot-in-progress
// until they decide at end-of-cook to keep or discard it.
//
// The fork is a personal-scope SavedRecipe pointing at the same
// ParsedRecipe as the original. Its visible card is stored INSIDE
// pivotMeta.revisedCard — not in a per-(parsedRecipe, scope)
// RecipeOverride row — because pivot edits should never bleed onto
// the user's other personal save of the same canonical recipe.
// resolveCard knows to short-circuit on pivotMeta.revisedCard.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as {
    problemText?: string;
    doneSteps?: number[];
    miseEntryKeys?: string[];
  };
  const problemText = body.problemText?.trim();
  if (!problemText) {
    return NextResponse.json({ error: "problemText required" }, { status: 400 });
  }
  const doneSteps = Array.isArray(body.doneSteps)
    ? body.doneSteps.filter((n): n is number => typeof n === "number")
    : [];
  const miseEntryKeys = Array.isArray(body.miseEntryKeys)
    ? body.miseEntryKeys.filter((k): k is string => typeof k === "string")
    : [];

  const source = await prisma.savedRecipe.findUnique({
    where: { id },
    include: { parsedRecipe: true },
  });
  if (!source) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Access check: owner (personal scope) or family member (family scope).
  // Guests can't pivot — they don't have a real cook session here, and the
  // fork would land in the wrong user's library.
  if (source.familyId === null) {
    if (source.userId !== user.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else {
    const member = await prisma.familyMember.findUnique({
      where: { userId_familyId: { userId: user.userId, familyId: source.familyId } },
    });
    if (!member) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const resolved = await resolveCard(source);

  let pivot;
  try {
    pivot = await runPivot({
      originalCard: resolved.card,
      doneSteps,
      miseEntryKeys,
      problemText,
    });
  } catch (err) {
    console.error("[pivot] runPivot failed", err);
    return NextResponse.json(
      { error: "the chef couldn't think of anything — try again with more detail?" },
      { status: 502 }
    );
  }

  const pivotMeta: PivotMeta = {
    problemText,
    aiNotes: pivot.mapping.aiNotes,
    changes: pivot.mapping.changes,
    revisedCard: pivot.revisedCard,
    createdAt: Date.now(),
  };

  // Hand-rolled fork. Always personal-scope, regardless of original scope —
  // pivots are private to the cook in the kitchen until they share or move
  // them. The unique constraint on SavedRecipe is NULL-distinct on
  // familyId, so the user can have an existing personal-scope save of this
  // ParsedRecipe AND the new pivot fork side-by-side without violating it.
  const created = await prisma.$transaction(async (tx) => {
    const saved = await tx.savedRecipe.create({
      data: {
        userId: user.userId,
        parsedRecipeId: source.parsedRecipeId,
        familyId: null,
        pivotedFromSavedRecipeId: source.id,
        pivotMeta,
        pivotKept: false,
      },
    });
    if (pivot.mapping.newCheckedEntryKeys.length > 0) {
      await tx.miseCheck.createMany({
        data: pivot.mapping.newCheckedEntryKeys.map((entryKey) => ({
          savedRecipeId: saved.id,
          userId: user.userId,
          entryKey,
        })),
        skipDuplicates: true,
      });
    }
    return saved;
  });

  return NextResponse.json({
    newSavedRecipeId: created.id,
    aiNotes: pivot.mapping.aiNotes,
    changes: pivot.mapping.changes,
    newDoneSteps: pivot.mapping.newDoneSteps,
  });
}
