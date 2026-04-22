import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { plannerModel } from "@/app/lib/planner/model";
import { PlanIntake } from "@/app/lib/planner/schemas";
import { INTAKE_EXTRACT_SYSTEM_PROMPT } from "@/app/lib/planner/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

function nextMondayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const offset = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
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

  const prompt = [
    `Today is ${new Date().toISOString().slice(0, 10)}. The upcoming Monday is ${nextMondayISO()}.`,
    "",
    "TRANSCRIPT",
    transcript,
  ].join("\n");

  const result = await generateObject({
    model: plannerModel,
    schema: PlanIntake,
    system: INTAKE_EXTRACT_SYSTEM_PROMPT,
    prompt,
  });

  const weekOfDate = new Date(result.object.weekOf);
  const weekOf = isNaN(weekOfDate.getTime())
    ? new Date(nextMondayISO())
    : weekOfDate;

  await prisma.weeklyPlan.update({
    where: { id: planId },
    data: {
      intake: result.object,
      weekOf,
      status: "INTAKE_COMPLETE",
    },
  });

  return NextResponse.json({ intake: result.object });
}
