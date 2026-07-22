import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { plannerModel } from "@/app/lib/planner/model";
import { PlanIntake } from "@/app/lib/planner/schemas";
import { intakeExtractSystemPrompt } from "@/app/lib/planner/prompts";
import { recordPlanEvent } from "@/app/lib/planner/events";
import { upsertProfilesFromIntake } from "@/app/lib/planner/profile-backfill";

export const runtime = "nodejs";
export const maxDuration = 120;

function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextMondayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const offset = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + offset);
  return localISO(d);
}

// Parse a YYYY-MM-DD as LOCAL midnight. `new Date("2026-07-21")` is UTC
// midnight, which renders as the previous day in western timezones — glaring
// on a TONIGHT plan whose header would read yesterday's date.
function localDateFromISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const messages = await prisma.intakeMessage.findMany({
    where: { planId },
    orderBy: { createdAt: "asc" },
  });
  if (messages.length === 0) {
    return NextResponse.json(
      { error: "no intake messages yet" },
      { status: 409 }
    );
  }

  const transcript = messages
    .map((m) => `${m.role === "USER" ? "USER" : "ASSISTANT"}: ${m.content}`)
    .join("\n\n");

  const todayISO = localISO(new Date());
  const dateLine =
    plan.scope === "TONIGHT"
      ? `Today is ${todayISO}. This plan is for TONIGHT'S dinner (${todayISO}).`
      : `Today is ${todayISO}. The upcoming Monday is ${nextMondayISO()}.`;

  const prompt = [dateLine, "", "TRANSCRIPT", transcript].join("\n");

  const result = await generateObject({
    model: plannerModel,
    schema: PlanIntake,
    system: intakeExtractSystemPrompt(plan.scope),
    prompt,
  });

  const fallbackISO = plan.scope === "TONIGHT" ? todayISO : nextMondayISO();
  const weekOf =
    localDateFromISO(result.object.weekOf) ?? localDateFromISO(fallbackISO)!;

  await prisma.weeklyPlan.update({
    where: { id: planId },
    data: {
      intake: result.object,
      weekOf,
      status: "INTAKE_COMPLETE",
    },
  });

  // Best-effort backfill — never fail the user-visible extract on a profile
  // upsert hiccup. Item 1.2.
  try {
    await upsertProfilesFromIntake(result.object, plan.familyId);
  } catch (err) {
    console.error("[profile-backfill] failed", { planId, err });
  }

  await recordPlanEvent(
    planId,
    "intake.extracted",
    { messageCount: messages.length, weekOf: weekOf.toISOString() },
    user.userId,
  );

  return NextResponse.json({ intake: result.object });
}
