import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { resolveCard } from "@/app/lib/card-resolver";
import { CookCardView } from "@/app/components/CookCardView";
import { GuestForkBanner } from "./GuestForkBanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Roadmap item 2.20 — anonymous read of a recipe via opaque token.
// /r/[token] reuses CookCardView (no execution-layer mods). Sign-in CTA
// invites guests to fork into their own library; we deliberately don't
// touch the existing /api/recipes/[id] auth path — share-tokens have
// their own route at /api/share/[token].

export default async function PublicRecipePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await prisma.recipeShareToken.findUnique({
    where: { token },
    include: {
      savedRecipe: {
        include: {
          parsedRecipe: true,
        },
      },
    },
  });
  if (!t || t.revokedAt) notFound();
  if (t.expiresAt && t.expiresAt < new Date()) {
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

  const resolved = await resolveCard(t.savedRecipe);

  // Best-effort view counter (mirrors the API route).
  try {
    await prisma.recipeShareToken.update({
      where: { id: t.id },
      data: { viewCount: { increment: 1 } },
    });
  } catch {}

  return (
    <main className="flex flex-1 flex-col px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <GuestForkBanner savedRecipeId={t.savedRecipe.id} />
        <CookCardView card={resolved.card} />
      </div>
    </main>
  );
}
