import { prisma } from "@/app/lib/prisma";
import { applyCanonicalFallback } from "@/app/lib/card-fallback";
import type { NextRequest } from "next/server";
import type { CookCard } from "@/app/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Roadmap item 2.17 — ICS export for the Hosted Menu. Each menu item lands
// as a single all-day VEVENT on its respective day of the week starting
// from `weekOf`. Public per decision #2 — anyone with the slug can fetch.
//
// Day mapping is best-effort: planner candidates carry `targetDay` only at
// Tonight pick time, so most items don't have a day pinned. We fall back
// to spreading the items across the seven days starting from weekOf, in
// position order — gets the menu onto the calendar without forcing a "day"
// noun where the system doesn't have one.

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const plan = await prisma.weeklyPlan.findUnique({
    where: { publishedSlug: slug },
    include: {
      family: { select: { name: true } },
      menuItems: {
        orderBy: { position: "asc" },
        include: {
          plannedMeal: {
            select: { candidate: { select: { composedCardDraft: true } } },
          },
        },
      },
    },
  });
  if (!plan || !plan.publishedSlug) {
    return new Response("Not found", { status: 404 });
  }

  const familyName = plan.family?.name ?? "the kitchen";
  const weekStart = new Date(plan.weekOf);
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Recipe Guide//Hosted Menu//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(`Menu from ${familyName}`)}`,
  ];

  plan.menuItems.forEach((item, idx) => {
    const card = applyCanonicalFallback(
      item.snapshotCardJson as unknown as CookCard,
      item.plannedMeal?.candidate.composedCardDraft as unknown as
        | CookCard
        | undefined
    );
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + (idx % 7));
    const dt = formatIcsDate(day);
    const dtNext = formatIcsDate(addDays(day, 1));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@recipeguide`,
      `DTSTAMP:${stamp}Z`,
      `DTSTART;VALUE=DATE:${dt}`,
      `DTEND;VALUE=DATE:${dtNext}`,
      `SUMMARY:${escapeIcs(`${item.courseLabel ?? "Meal"}: ${card.title}`)}`,
      `DESCRIPTION:${escapeIcs(item.displayBlurb ?? card.tagline ?? "")}`,
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="menu-${slug}.ics"`,
      "cache-control": "public, max-age=300",
    },
  });
}

function formatIcsDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
