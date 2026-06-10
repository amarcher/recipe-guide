import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { findSprite } from "@/app/lib/sprites-core";
import { recordFamilyEvent } from "@/app/lib/family-events";
import { serializePantryItem } from "@/app/lib/pantry/serialize";

export const runtime = "nodejs";

async function familiesFor(userId: string) {
  const memberships = await prisma.familyMember.findMany({
    where: { userId },
    include: { family: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => ({ id: m.family.id, name: m.family.name }));
}

async function resolveFamilyId(
  userId: string,
  requested: string | null,
): Promise<
  | { ok: true; familyId: string; families: Array<{ id: string; name: string }> }
  | { ok: false; status: number; error: string }
> {
  const families = await familiesFor(userId);
  if (families.length === 0)
    return { ok: false, status: 400, error: "no family" };
  if (requested) {
    if (!families.some((f) => f.id === requested))
      return { ok: false, status: 404, error: "not found" };
    return { ok: true, familyId: requested, families };
  }
  return { ok: true, familyId: families[0].id, families };
}

function parseMustUseBy(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  return undefined;
}

const ITEM_INCLUDE = { addedBy: { select: { name: true } } } as const;

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const requested = req.nextUrl.searchParams.get("familyId");
  const families = await familiesFor(user.userId);
  if (families.length === 0)
    return NextResponse.json({ families: [], familyId: null, items: [] });
  if (requested && !families.some((f) => f.id === requested))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const familyId = requested ?? families[0].id;

  const items = await prisma.pantryItem.findMany({
    where: { familyId },
    include: ITEM_INCLUDE,
    orderBy: { addedAt: "desc" },
  });

  return NextResponse.json({
    families,
    familyId,
    items: items.map(serializePantryItem),
  });
}

// Body: { familyId?, display, quantity?, unit?, mustUseBy? (epoch ms | null) }
// Adding something already on hand (same slug — or same normalized name when
// no slug resolves — at the same unit) tops up the existing row instead of
// duplicating it. The (familyId, slug, unit) identity has nullable parts, so
// the upsert is hand-rolled findFirst → update | create.
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    familyId?: string;
    display?: string;
    quantity?: string;
    unit?: string;
    mustUseBy?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const display = String(body.display ?? "").trim();
  if (!display || display.length > 80)
    return NextResponse.json(
      { error: "display required (1–80 chars)" },
      { status: 400 },
    );

  const resolved = await resolveFamilyId(user.userId, body.familyId ?? null);
  if (!resolved.ok)
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );

  const slug = findSprite(display);
  const unit = String(body.unit ?? "").trim().toLowerCase() || null;
  const quantity = String(body.quantity ?? "").trim() || null;
  const mustUseBy = parseMustUseBy(body.mustUseBy);
  if (mustUseBy === undefined && body.mustUseBy !== undefined)
    return NextResponse.json({ error: "invalid mustUseBy" }, { status: 400 });

  const existing = await prisma.pantryItem.findFirst({
    where: {
      familyId: resolved.familyId,
      unit,
      ...(slug
        ? { slug }
        : { slug: null, display: { equals: display, mode: "insensitive" } }),
    },
    orderBy: { addedAt: "desc" },
  });

  const item = existing
    ? await prisma.pantryItem.update({
        where: { id: existing.id },
        data: {
          display,
          quantity: quantity ?? existing.quantity,
          mustUseBy: mustUseBy === undefined ? existing.mustUseBy : mustUseBy,
          addedAt: new Date(),
          addedById: user.userId,
          source: "manual",
        },
        include: ITEM_INCLUDE,
      })
    : await prisma.pantryItem.create({
        data: {
          familyId: resolved.familyId,
          slug,
          display,
          unit,
          quantity,
          mustUseBy: mustUseBy ?? null,
          addedById: user.userId,
          source: "manual",
        },
        include: ITEM_INCLUDE,
      });

  await recordFamilyEvent({
    familyId: resolved.familyId,
    kind: existing ? "pantry.updated" : "pantry.added",
    payload: { itemId: item.id, display, slug, unit },
    actorId: user.userId,
  });

  return NextResponse.json({
    item: serializePantryItem(item),
    merged: !!existing,
  });
}

// Clear the whole pantry for a family (?familyId= optional, defaults to the
// user's first family).
export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const resolved = await resolveFamilyId(
    user.userId,
    req.nextUrl.searchParams.get("familyId"),
  );
  if (!resolved.ok)
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );

  const { count } = await prisma.pantryItem.deleteMany({
    where: { familyId: resolved.familyId },
  });

  if (count > 0) {
    await recordFamilyEvent({
      familyId: resolved.familyId,
      kind: "pantry.cleared",
      payload: { count },
      actorId: user.userId,
    });
  }

  return NextResponse.json({ ok: true, removed: count });
}
