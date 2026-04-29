import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { cascadeEntryKeys } from "@/app/lib/planner/mise-cascade";
import { findSprite } from "@/app/lib/sprites-core";
import { recordFamilyEvent } from "@/app/lib/family-events";
import type { CookCard } from "@/app/types";

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

  // Personal checks (the user's own MiseCheck rows).
  const personal = await prisma.miseCheck.findMany({
    where: { savedRecipeId: id, userId: user.userId },
    select: { entryKey: true },
  });
  const checked = new Set(personal.map((c) => c.entryKey));

  // Roadmap item 1.12 — pantry → mise cascade. For family-scoped recipes,
  // any ingredient whose slug matches a PantryItem in the family's pantry
  // appears pre-checked. Pure read-time compute; no row writes. The cascade
  // is indistinct from manual checks at the UI layer per the
  // execution-layer-untouchable rule.
  const saved = await prisma.savedRecipe.findUnique({
    where: { id },
    select: {
      familyId: true,
      parsedRecipe: { select: { cardJson: true } },
      family: { select: { syncExecution: true } },
    },
  });
  if (saved?.familyId && saved.parsedRecipe) {
    const pantry = await prisma.pantryItem.findMany({
      where: { familyId: saved.familyId, slug: { not: null } },
      select: { slug: true },
    });
    const pantrySlugs = new Set(
      pantry.map((p) => p.slug).filter((s): s is string => !!s),
    );
    if (pantrySlugs.size > 0) {
      const card = saved.parsedRecipe.cardJson as unknown as CookCard;
      for (const k of cascadeEntryKeys(card, pantrySlugs, findSprite)) {
        checked.add(k);
      }
    }
  }

  // Roadmap item 2.14 — Meezing. When Family.syncExecution is true, shared
  // checks from any family member surface for everyone. We DO NOT modify
  // MisePlace to distinguish them visually (per the execution-layer-
  // untouchable rule); the API just unions them in.
  if (saved?.familyId && saved.family?.syncExecution) {
    const shared = await prisma.miseCheckShared.findMany({
      where: { savedRecipeId: id, familyId: saved.familyId },
      select: { entryKey: true },
    });
    for (const c of shared) checked.add(c.entryKey);
  }

  return NextResponse.json({ checked: [...checked] });
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

  // Roadmap item 2.14 — mirror to MiseCheckShared for family scopes with
  // syncExecution on. The shared row is a sibling to the per-user
  // MiseCheck — we never migrate, we duplicate. This keeps personal
  // checks intact when sync is later turned off.
  const saved = await prisma.savedRecipe.findUnique({
    where: { id },
    select: {
      familyId: true,
      family: { select: { syncExecution: true } },
    },
  });
  if (saved?.familyId && saved.family?.syncExecution) {
    if (body.checked) {
      const existing = await prisma.miseCheckShared.findUnique({
        where: {
          savedRecipeId_familyId_entryKey: {
            savedRecipeId: id,
            familyId: saved.familyId,
            entryKey: body.entryKey,
          },
        },
      });
      if (!existing) {
        await prisma.miseCheckShared.create({
          data: {
            savedRecipeId: id,
            familyId: saved.familyId,
            entryKey: body.entryKey,
            checkedById: user.userId,
            source: "manual",
          },
        });
      }
    } else {
      await prisma.miseCheckShared.deleteMany({
        where: {
          savedRecipeId: id,
          familyId: saved.familyId,
          entryKey: body.entryKey,
        },
      });
    }
    await recordFamilyEvent({
      familyId: saved.familyId,
      kind: body.checked ? "mise.checked" : "mise.unchecked",
      savedRecipeId: id,
      payload: { entryKey: body.entryKey },
      actorId: user.userId,
    });
  }

  return NextResponse.json({ ok: true });
}

// Clear all mise checks for the current user on this recipe.
//
// Roadmap item 2.14 — for family-sync recipes we soft-delete the SHARED
// rows too because cook-finish is a session-wide reset signal. We don't
// touch other family members' personal MiseCheck rows. (Mid-cook reset of
// only the shared rows lives in a future overflow on the SaveBar.)
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
  const saved = await prisma.savedRecipe.findUnique({
    where: { id },
    select: {
      familyId: true,
      family: { select: { syncExecution: true } },
    },
  });
  if (saved?.familyId && saved.family?.syncExecution) {
    await prisma.miseCheckShared.deleteMany({
      where: { savedRecipeId: id, familyId: saved.familyId },
    });
    await recordFamilyEvent({
      familyId: saved.familyId,
      kind: "mise.reset",
      savedRecipeId: id,
      actorId: user.userId,
    });
  }
  return NextResponse.json({ ok: true });
}
