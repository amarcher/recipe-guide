import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

// End-of-life decision for an in-progress pivot fork. Called from the
// PivotInProgressBanner on the recipe page.
//
//   keep    → pivotKept = true. The row stays in the library as a
//             permanent personal recipe; the badge disappears.
//   discard → delete the SavedRecipe entirely. Cascades to MiseCheck and
//             CookLog rows. The original recipe the pivot forked from is
//             untouched.
//
// 404 when the row isn't a pivot (no pivotMeta) — defends against the UI
// accidentally pointing at a non-pivot row.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let action: "keep" | "discard" | null = null;
  try {
    const body = await req.json();
    if (body?.action === "keep" || body?.action === "discard") {
      action = body.action;
    }
  } catch {
    // fall through to 400 below
  }
  if (!action) {
    return NextResponse.json(
      { error: 'action must be "keep" or "discard"' },
      { status: 400 }
    );
  }

  const row = await prisma.savedRecipe.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.userId !== user.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!row.pivotMeta) {
    return NextResponse.json(
      { error: "not a pivot fork" },
      { status: 404 }
    );
  }

  if (action === "keep") {
    await prisma.savedRecipe.update({
      where: { id },
      data: { pivotKept: true },
    });
    return NextResponse.json({ ok: true, action: "keep" });
  }

  // discard
  await prisma.savedRecipe.delete({ where: { id } });
  return NextResponse.json({ ok: true, action: "discard" });
}
