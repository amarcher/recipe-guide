import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { plannerModel } from "@/app/lib/planner/model";
import { MenuSkeleton, PlanIntake } from "@/app/lib/planner/schemas";
import { SKELETON_SYSTEM_PROMPT } from "@/app/lib/planner/prompts";
import { loadRecentRecipes } from "@/app/lib/planner/history";
import { recordPlanEvent } from "@/app/lib/planner/events";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!plan.intake) {
    return NextResponse.json(
      { error: "plan has no intake yet — run intake first" },
      { status: 409 }
    );
  }

  let guidance: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    guidance = typeof body?.guidance === "string" && body.guidance.trim() ? body.guidance.trim() : null;
  } catch {
    guidance = null;
  }

  const intakeParsed = PlanIntake.safeParse(plan.intake);
  if (!intakeParsed.success) {
    return NextResponse.json(
      { error: "stored intake does not match PlanIntake schema" },
      { status: 500 }
    );
  }

  const history = await loadRecentRecipes(plan.createdById, plan.familyId);
  const existingSkeleton = plan.skeleton ? MenuSkeleton.safeParse(plan.skeleton) : null;

  const sections: string[] = [
    "INTAKE",
    JSON.stringify(intakeParsed.data, null, 2),
    "",
    "RECENT RECIPES",
    history.length
      ? history
          .map(
            (r) =>
              `- "${r.title}" — cooked ${r.cookCount}x${r.daysSinceCooked !== null ? `, ${r.daysSinceCooked}d ago` : ", never"}`
          )
          .join("\n")
      : "(no recent recipes)",
  ];

  if (existingSkeleton?.success) {
    sections.push(
      "",
      "PREVIOUS SKELETON (for reference — preserve what works, change what the user flagged)",
      JSON.stringify(existingSkeleton.data, null, 2)
    );
  }

  if (guidance) {
    sections.push(
      "",
      "USER GUIDANCE FOR THIS REGENERATION",
      guidance,
      "",
      "Apply this guidance. Keep the parts of the previous skeleton the user didn't flag; change only what they asked to change."
    );
  }

  const userMessage = sections.join("\n");

  const result = await generateObject({
    model: plannerModel,
    schema: MenuSkeleton,
    system: SKELETON_SYSTEM_PROMPT,
    prompt: userMessage,
  });

  await prisma.weeklyPlan.update({
    where: { id: plan.id },
    data: { skeleton: result.object, status: "SKELETON_READY" },
  });

  await recordPlanEvent(
    plan.id,
    "skeleton.created",
    { hasGuidance: !!guidance, regenerated: !!existingSkeleton?.success },
    user.userId,
  );

  return NextResponse.json({ skeleton: result.object });
}
