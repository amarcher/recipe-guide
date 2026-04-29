import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { InboxView } from "./InboxView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Roadmap item 2.21 — notification inbox at /inbox. NO comments —
// per-event rows only, links to the source artifact.

export default async function InboxPage() {
  const user = await requireUser();
  if (!user) redirect("/");

  const rows = await prisma.notification.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      actorUser: { select: { id: true, name: true, image: true } },
    },
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Inbox
        </h1>
        <a
          href="/library"
          className="text-sm font-medium text-stone-600 hover:text-stone-900"
        >
          Library →
        </a>
      </header>
      <InboxView
        initial={rows.map((n) => ({
          id: n.id,
          type: n.type,
          payload: n.payload,
          readAt: n.readAt?.getTime() ?? null,
          createdAt: n.createdAt.getTime(),
          actor: n.actorUser
            ? {
                id: n.actorUser.id,
                name: n.actorUser.name,
                image: n.actorUser.image,
              }
            : null,
        }))}
      />
    </main>
  );
}
