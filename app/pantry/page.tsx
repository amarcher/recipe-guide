import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { serializePantryItem } from "@/app/lib/pantry/serialize";
import { PantryView } from "./PantryView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Pantry" };

export default async function PantryPage() {
  const user = await requireUser();
  if (!user) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <p className="text-sm text-stone-600">Sign in to see your pantry.</p>
        <Link href="/" className="text-sm font-medium text-stone-900 underline">
          Back home
        </Link>
      </main>
    );
  }

  const memberships = await prisma.familyMember.findMany({
    where: { userId: user.userId },
    include: { family: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const families = memberships.map((m) => ({
    id: m.family.id,
    name: m.family.name,
  }));

  if (families.length === 0) {
    return (
      <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="font-serif text-3xl font-medium tracking-tight text-stone-900">
            Pantry
          </h1>
          <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center">
            <p className="font-serif text-lg italic text-stone-700">
              The pantry belongs to a family.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-500">
              It&apos;s the shared record of what&apos;s on hand at home — items you
              check off a family grocery list land here automatically, and
              recipes pre-check ingredients you already have. Create or join a
              family to start one.
            </p>
            <Link
              href="/settings"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
            >
              Set up a family
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const familyId = families[0].id;
  const items = await prisma.pantryItem.findMany({
    where: { familyId },
    include: { addedBy: { select: { name: true } } },
    orderBy: { addedAt: "desc" },
  });

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <PantryView
          families={families}
          initialFamilyId={familyId}
          initialItems={items.map(serializePantryItem)}
        />
      </div>
    </main>
  );
}
