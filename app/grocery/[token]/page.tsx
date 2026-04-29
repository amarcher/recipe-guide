import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { ShareGroceryView } from "./ShareGroceryView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Roadmap item 2.19 — public view of a shared grocery list. Anonymous
// read+write — the opaque token is the gate. Renders the same sprite-
// driven aisle grid as item 2.18, posting through the share-token API.

export default async function PublicGroceryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await prisma.groceryListShare.findUnique({
    where: { token },
    include: {
      plan: {
        include: {
          family: { select: { name: true } },
          groceries: {
            orderBy: [{ purchased: "asc" }, { display: "asc" }],
          },
        },
      },
    },
  });
  if (!share || share.revokedAt) notFound();
  if (share.expiresAt && share.expiresAt < new Date()) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-stone-900">
          This share has expired.
        </h1>
        <p className="mt-3 text-stone-600">
          Ask whoever sent it to start a new one.
        </p>
      </main>
    );
  }

  const familyName = share.plan.family?.name ?? null;
  const weekDate = share.plan.weekOf.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <main className="min-h-screen bg-[#f8f1e2] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.25em] text-stone-500">
            Shared grocery list
          </p>
          <h1 className="mt-1 font-serif text-2xl font-medium text-stone-900">
            {familyName ? `${familyName}'s list` : "Grocery list"}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            For the week of {weekDate}. Tap a tile when you put it in the cart.
          </p>
        </header>

        <ShareGroceryView
          token={token}
          initialItems={share.plan.groceries.map((g) => ({
            id: g.id,
            display: g.display,
            slug: g.slug,
            unit: g.unit,
            quantity: g.quantity,
            purchased: g.purchased,
          }))}
        />
      </div>
    </main>
  );
}
