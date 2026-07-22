import { NextRequest, NextResponse } from "next/server";
import {
  streamText,
  convertToModelMessages,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { intakeChatModel } from "@/app/lib/planner/model";
import { intakeChatSystemPrompt } from "@/app/lib/planner/prompts";
import { loadRecentRecipes } from "@/app/lib/planner/history";

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

  const body = (await req.json()) as { messages: UIMessage[] };
  const uiMessages = body.messages ?? [];

  const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
  if (lastUser) {
    const content = uiMessages
      .filter((m) => m.id === lastUser.id)
      .flatMap((m) =>
        m.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
      )
      .join("");
    if (content) {
      const exists = await prisma.intakeMessage.findFirst({
        where: { planId, role: "USER", content },
        orderBy: { createdAt: "desc" },
      });
      if (!exists) {
        await prisma.intakeMessage.create({
          data: { planId, role: "USER", content },
        });
      }
    }
  }

  const history = await loadRecentRecipes(plan.createdById, plan.familyId);
  const historyBlock = history.length
    ? history
        .map(
          (r) =>
            `- "${r.title}" — cooked ${r.cookCount}x${r.daysSinceCooked !== null ? `, ${r.daysSinceCooked}d ago` : ", never"}`
        )
        .join("\n")
    : "(no recent recipes)";

  const system = `${intakeChatSystemPrompt(plan.scope)}\n\nRECENT RECIPES (read-only context — don't recite)\n${historyBlock}`;

  const modelMessages = await convertToModelMessages(uiMessages);

  const result = streamText({
    model: intakeChatModel,
    system,
    messages: modelMessages,
    tools: {
      signal_intake_complete: tool({
        description:
          "Call when the intake is adequately covered. The UI will show the user an extracted summary to confirm before candidate generation runs.",
        inputSchema: z.object({
          summary: z
            .string()
            .describe("One paragraph capturing the week's shape in the user's own language."),
        }),
        execute: async ({ summary }: { summary: string }) => {
          await prisma.weeklyPlan.update({
            where: { id: planId },
            data: { status: "INTAKE_COMPLETE" },
          });
          return { ok: true, summary };
        },
      }),
    },
    onFinish: async ({ text }) => {
      if (text) {
        await prisma.intakeMessage.create({
          data: { planId, role: "ASSISTANT", content: text },
        });
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
