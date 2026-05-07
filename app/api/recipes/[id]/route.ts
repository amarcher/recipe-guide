import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { resolveCard, overrideScopeFor } from "@/app/lib/card-resolver";
import { slimPivotMetaForClient } from "@/app/lib/pivot/meta";
import { validateCardPayload } from "@/app/lib/card-validate";

export const runtime = "nodejs";

async function loadAccess(userId: string, id: string) {
  // Load by id alone — the GET handler decides what to expose based on the
  // viewer's relationship to this row's scope. We compute that with one
  // membership lookup so guests still see read-only data instead of a 404.
  const row = await prisma.savedRecipe.findUnique({
    where: { id },
    include: {
      parsedRecipe: true,
      family: { select: { id: true, name: true } },
    },
  });
  if (!row) return null;
  let access: "owner" | "family" | "guest";
  if (row.familyId === null) {
    access = row.userId === userId ? "owner" : "guest";
  } else {
    const member = await prisma.familyMember.findUnique({
      where: { userId_familyId: { userId, familyId: row.familyId } },
    });
    access = member ? "family" : "guest";
  }
  return { row, access };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const found = await loadAccess(user.userId, id);
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { row: r, access } = found;

  const resolved = await resolveCard(r);

  // Cook history is scope-private. Hide from guests viewing a shared link.
  let cookHistory: Array<{
    userId: string;
    name: string | null;
    image: string | null;
    cookCount: number;
    lastCookedAt: number | null;
    isMe: boolean;
  }> = [];
  if (access !== "guest") {
    const siblings = await prisma.savedRecipe.findMany({
      where: {
        parsedRecipeId: r.parsedRecipeId,
        familyId: r.familyId,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });
    cookHistory = siblings
      .map((s) => ({
        userId: s.user.id,
        name: s.user.name,
        image: s.user.image,
        cookCount: s.cookCount,
        lastCookedAt: s.lastCookedAt?.getTime() ?? null,
        isMe: s.user.id === user.userId,
      }))
      .sort((a, b) => {
        if (b.cookCount !== a.cookCount) return b.cookCount - a.cookCount;
        return (b.lastCookedAt ?? 0) - (a.lastCookedAt ?? 0);
      });
  }

  return NextResponse.json({
    id: r.id,
    sourceUrl: r.parsedRecipe.sourceUrl,
    title: resolved.card.title ?? r.parsedRecipe.title,
    card: resolved.card,
    family: r.family,
    savedAt: r.savedAt.getTime(),
    lastCookedAt: access === "guest" ? null : r.lastCookedAt?.getTime() ?? null,
    cookCount: access === "guest" ? 0 : r.cookCount,
    cookHistory,
    viewerAccess: access,
    overrideUpdatedAt: resolved.overrideUpdatedAt?.getTime() ?? null,
    pivotMeta: access === "guest" ? null : slimPivotMetaForClient(r.pivotMeta),
    pivotKept: access === "guest" ? false : r.pivotKept,
    pivotedFromSavedRecipeId: access === "guest" ? null : r.pivotedFromSavedRecipeId,
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  // Only the saver (or family admin) can delete. Keep it simple: only saver.
  const row = await prisma.savedRecipe.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ ok: true });
  if (row.userId !== user.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await prisma.savedRecipe.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Returns true when the viewer has edit permission on this SavedRecipe.
// Personal scope: only the saver. Family scope: any member of the family.
async function canEdit(
  userId: string,
  saved: { userId: string; familyId: string | null }
): Promise<boolean> {
  if (saved.familyId === null) return saved.userId === userId;
  const member = await prisma.familyMember.findUnique({
    where: { userId_familyId: { userId, familyId: saved.familyId } },
  });
  return !!member;
}

// PATCH: write a per-scope override. Concurrency: client sends If-Match with
// the override's prior updatedAt (ms); 409 on mismatch so the second writer
// can reload before clobbering.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const row = await prisma.savedRecipe.findUnique({
    where: { id },
    include: { parsedRecipe: { select: { sourceUrl: true } } },
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canEdit(user.userId, row))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const validated = validateCardPayload(body, row.parsedRecipe.sourceUrl);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const scope = overrideScopeFor(row);
  const ifMatchHeader = req.headers.get("if-match");
  const existing = await prisma.recipeOverride.findFirst({
    where: {
      parsedRecipeId: row.parsedRecipeId,
      userId: scope.userId,
      familyId: scope.familyId,
    },
  });

  if (ifMatchHeader && existing) {
    const current = existing.updatedAt.getTime().toString();
    if (ifMatchHeader !== current) {
      return NextResponse.json(
        {
          error: "conflict",
          currentUpdatedAt: existing.updatedAt.getTime(),
        },
        { status: 409 }
      );
    }
  }

  const next = existing
    ? await prisma.recipeOverride.update({
        where: { id: existing.id },
        data: {
          cardJson: validated.card as unknown as object,
          updatedById: user.userId,
        },
      })
    : await prisma.recipeOverride.create({
        data: {
          parsedRecipeId: row.parsedRecipeId,
          userId: scope.userId,
          familyId: scope.familyId,
          cardJson: validated.card as unknown as object,
          updatedById: user.userId,
        },
      });

  return NextResponse.json({
    ok: true,
    overrideUpdatedAt: next.updatedAt.getTime(),
  });
}
