import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import type { Metadata } from "next";
import type { CookCard } from "@/app/types";
import { MealFace, type MealFaceSubject } from "@/app/components/MealFace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Roadmap item 2.17 — public Hosted Menu. PUBLIC-BY-TOKEN per decision #2
// (2026-04-28); no auth wall. Slug uniqueness is the access gate.
//
// The published item carries a snapshotted CookCard JSON so post-publish
// recipe overrides don't drift the public menu out of sync. Re-publishing
// the plan refreshes the snapshots.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const plan = await prisma.weeklyPlan.findUnique({
    where: { publishedSlug: slug },
    select: {
      hostNote: true,
      family: { select: { name: true } },
      weekOf: true,
    },
  });
  if (!plan) return { title: "Menu" };
  const family = plan.family?.name ?? "the kitchen";
  return {
    title: `Menu from ${family}`,
    description:
      plan.hostNote ??
      `A week of meals from ${family}, served the week of ${plan.weekOf
        .toISOString()
        .slice(0, 10)}.`,
  };
}

export default async function HostedMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const plan = await prisma.weeklyPlan.findUnique({
    where: { publishedSlug: slug },
    include: {
      family: { select: { name: true } },
      menuItems: { orderBy: { position: "asc" } },
    },
  });
  if (!plan || !plan.publishedSlug) notFound();

  const familyName = plan.family?.name ?? "the kitchen";
  const weekDate = plan.weekOf.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main className="min-h-screen bg-[#f8f1e2] px-4 py-12 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <header className="text-center">
          <p className="font-serif text-[11px] uppercase tracking-[0.3em] text-stone-500">
            From the kitchen of {familyName}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight text-stone-900 sm:text-5xl">
            The week of {weekDate}
          </h1>
          {plan.hostNote && (
            <p className="mx-auto mt-6 max-w-xl font-serif text-base italic leading-relaxed text-stone-700">
              {plan.hostNote}
            </p>
          )}
          {plan.dietaryNote && (
            <p className="mx-auto mt-3 max-w-xl text-sm text-stone-600">
              <span className="font-medium">A note:</span> {plan.dietaryNote}
            </p>
          )}
        </header>

        <ul className="mt-12 space-y-10">
          {plan.menuItems.map((item) => {
            const card = item.snapshotCardJson as unknown as CookCard;
            const subject: MealFaceSubject = {
              id: item.id,
              title: card.title,
              tagline: item.displayBlurb ?? card.tagline ?? null,
              generatedDishImageUrl: card.generated_dish_image_url ?? null,
              heroIngredientSlugs: collectHeroSlugs(card),
            };
            return (
              <li
                key={item.id}
                className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
              >
                {item.courseLabel && (
                  <p className="mb-3 font-serif text-[11px] uppercase tracking-[0.25em] text-stone-500">
                    {item.courseLabel}
                  </p>
                )}
                <MealFace subject={subject} size="spread" />
              </li>
            );
          })}
        </ul>

        <footer className="mt-12 border-t border-stone-200 pt-8 text-center font-serif text-[11px] uppercase tracking-[0.25em] text-stone-400">
          Published {plan.publishedAt
            ? plan.publishedAt.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "recently"}
          {" · "}
          <a href={`/menu/${plan.publishedSlug}/ics`} className="underline">
            Add to calendar
          </a>
        </footer>
      </div>
    </main>
  );
}

function collectHeroSlugs(card: CookCard): string[] {
  if (Array.isArray((card as unknown as { hero_ingredient_slugs?: string[] }).hero_ingredient_slugs)) {
    return (card as unknown as { hero_ingredient_slugs: string[] })
      .hero_ingredient_slugs;
  }
  // Fallback: pull the first 3 ingredient slugs from the pantry section.
  const out: string[] = [];
  for (const ing of card.pantry_ingredients ?? []) {
    if (out.length >= 4) break;
    if (typeof ing.item === "string") out.push(ing.item);
  }
  return out;
}
