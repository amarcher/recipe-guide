import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { prisma } from "@/app/lib/prisma";
import { IntakeChat } from "./IntakeChat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function IntakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/");
  const { id } = await params;

  const plan = await loadPlanIfOwned(user.userId, id);
  if (!plan) notFound();

  const priorMessages = await prisma.intakeMessage.findMany({
    where: { planId: id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-stone-400">
              Week of{" "}
              {plan.weekOf.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
              Let&apos;s plan the week
            </h1>
          </div>
          <Link
            href={`/plan/${id}`}
            className="text-sm font-medium text-stone-700 hover:text-stone-900"
          >
            Skip to menu
          </Link>
        </div>

        <IntakeChat
          planId={id}
          initialMessages={priorMessages.map((m) => ({
            id: m.id,
            role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
            parts: [{ type: "text" as const, text: m.content }],
          }))}
        />
      </div>
    </main>
  );
}
