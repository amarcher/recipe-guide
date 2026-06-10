import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { findSprite } from "@/app/lib/sprites-core";
import { recordFamilyEvent } from "@/app/lib/family-events";
import { serializePantryItem } from "@/app/lib/pantry/serialize";

export const runtime = "nodejs";

async function loadIfMember(userId: string, itemId: string) {
  const item = await prisma.pantryItem.findUnique({ where: { id: itemId } });
  if (!item) return null;
  const member = await prisma.familyMember.findFirst({
    where: { userId, familyId: item.familyId },
    select: { id: true },
  });
  return member ? item : null;
}

// Body: { display?, quantity? (null clears), unit? (null clears),
//         mustUseBy? (epoch ms | null clears) }
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ itemId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { itemId } = await ctx.params;

  const item = await loadIfMember(user.userId, itemId);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: {
    display?: string;
    quantity?: string | null;
    unit?: string | null;
    mustUseBy?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const data: {
    display?: string;
    slug?: string | null;
    quantity?: string | null;
    unit?: string | null;
    mustUseBy?: Date | null;
  } = {};

  if (body.display !== undefined) {
    const display = String(body.display).trim();
    if (!display || display.length > 80)
      return NextResponse.json(
        { error: "display required (1–80 chars)" },
        { status: 400 },
      );
    data.display = display;
    data.slug = findSprite(display);
  }
  if (body.quantity !== undefined)
    data.quantity = body.quantity === null ? null : String(body.quantity).trim() || null;
  if (body.unit !== undefined)
    data.unit =
      body.unit === null ? null : String(body.unit).trim().toLowerCase() || null;
  if (body.mustUseBy !== undefined) {
    if (body.mustUseBy === null) data.mustUseBy = null;
    else if (typeof body.mustUseBy === "number" && Number.isFinite(body.mustUseBy))
      data.mustUseBy = new Date(body.mustUseBy);
    else return NextResponse.json({ error: "invalid mustUseBy" }, { status: 400 });
  }

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const updated = await prisma.pantryItem.update({
    where: { id: item.id },
    data,
    include: { addedBy: { select: { name: true } } },
  });

  await recordFamilyEvent({
    familyId: item.familyId,
    kind: "pantry.updated",
    payload: { itemId: item.id, display: updated.display, slug: updated.slug },
    actorId: user.userId,
  });

  return NextResponse.json({ item: serializePantryItem(updated) });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ itemId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { itemId } = await ctx.params;

  const item = await loadIfMember(user.userId, itemId);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.pantryItem.delete({ where: { id: item.id } });

  await recordFamilyEvent({
    familyId: item.familyId,
    kind: "pantry.removed",
    payload: { itemId: item.id, display: item.display, slug: item.slug },
    actorId: user.userId,
  });

  return NextResponse.json({ ok: true });
}
