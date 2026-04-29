import { prisma } from "@/app/lib/prisma";
import type { ProfilePreferenceKind } from "@/app/generated/prisma/client";
import type { PlanIntake } from "@/app/lib/planner/schemas";

// Roadmap item 1.2 — backfill family Profiles + ProfilePreferences from a
// freshly-extracted PlanIntake.
//
// V1 shape: one "Adults" Profile + one "Kids" Profile per family. The intake
// schema doesn't enumerate kids by name (kidRules is a flat list of foods,
// not a per-kid map), so a single Kids Profile is the right granularity for
// now. When the intake extractor evolves to emit per-kid names, swap this
// for a per-name upsert without changing the table shape.
//
// Additive only — never deletes existing preferences. Re-confirming the same
// preference in a later week increments evidenceCount and refreshes
// lastConfirmedAt; that's the learning signal item 2.15 (MealOutcome) builds
// on.

type EaterRole = "ADULT" | "KID";

const ROLE_DEFAULTS: Record<EaterRole, { name: string }> = {
  ADULT: { name: "Adults" },
  KID: { name: "Kids" },
};

async function ensureProfile(familyId: string, kind: EaterRole) {
  const existing = await prisma.profile.findFirst({
    where: { familyId, kind },
  });
  if (existing) return existing;
  return prisma.profile.create({
    data: { familyId, kind, name: ROLE_DEFAULTS[kind].name },
  });
}

function normalizedKey(slug: string | null | undefined, display: string): string {
  return (slug ?? display).trim().toLowerCase();
}

async function upsertPreference(
  profileId: string,
  kind: ProfilePreferenceKind,
  slug: string | null | undefined,
  display: string,
  source: string,
): Promise<void> {
  // Hand-rolled upsert by (profileId, kind, normalizedKey) — Postgres
  // NULL-distinct rules out a clean composite unique on `slug`. We fetch all
  // matching preferences for the (profileId, kind) pair and dedupe in JS;
  // family preference cardinality is small (tens, not thousands).
  const candidates = await prisma.profilePreference.findMany({
    where: { profileId, kind },
  });
  const target = normalizedKey(slug, display);
  const match = candidates.find(
    (p) => normalizedKey(p.slug, p.display) === target,
  );
  if (match) {
    await prisma.profilePreference.update({
      where: { id: match.id },
      data: {
        lastConfirmedAt: new Date(),
        evidenceCount: { increment: 1 },
        // Don't overwrite source — earliest signal wins. Display can drift
        // ("brussels sprouts" vs "Brussels Sprouts") — keep what's there.
      },
    });
    return;
  }
  await prisma.profilePreference.create({
    data: {
      profileId,
      kind,
      slug: slug ?? null,
      display,
      source,
    },
  });
}

export async function upsertProfilesFromIntake(
  intake: PlanIntake,
  familyId: string | null,
): Promise<void> {
  if (!familyId) {
    // Personal-scope plans (rare — most plans auto-attach to a primary
    // family) don't get profiles. Profiles are family primitives.
    return;
  }

  const adults = await ensureProfile(familyId, "ADULT");
  const kids = await ensureProfile(familyId, "KID");

  // kidRules — kid-only RELIABLE_HIT and HARD_NO
  for (const e of intake.kidRules?.reliableHits ?? []) {
    await upsertPreference(kids.id, "RELIABLE_HIT", e.slug, e.display, "intake");
  }
  for (const e of intake.kidRules?.hardNos ?? []) {
    await upsertPreference(kids.id, "HARD_NO", e.slug, e.display, "intake");
  }

  // aspirations — split per kind. Aspirations are strings (no slug today).
  for (const display of intake.aspirations?.adults ?? []) {
    await upsertPreference(adults.id, "ASPIRATION", null, display, "intake");
  }
  for (const display of intake.aspirations?.kids ?? []) {
    await upsertPreference(kids.id, "ASPIRATION", null, display, "intake");
  }
}
