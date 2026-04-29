import { prisma } from "@/app/lib/prisma";
import type { CookCard } from "@/app/types";
import type { MealCandidate } from "@/app/generated/prisma/client";

// Roadmap item 1.5 — single point of materialization for a planner-side
// `MealCandidate` into the canonical `ParsedRecipe` cache (and optionally a
// `SavedRecipe`).
//
// Three scopes today; behavior diverges only on whether a SavedRecipe is
// created:
//
//   "execute" — caller is about to drop the user into the cook surface.
//               Ensure parsed + saved both exist for (user, family).
//
//   "library" — save to the user's library without invoking the cook flow.
//               Same data effects as "execute" today; separated by intent so
//               the cook route doesn't have to fan out the redirect.
//
//   "menu"    — caller is about to attach this dish to a HostedMenu (item
//               2.17). Only ensure ParsedRecipe exists; the host may not
//               have it in their library and shouldn't be forced to.
//
// Idempotent on (sourceUrl) for ParsedRecipe and on (userId, parsedRecipeId,
// familyId) for SavedRecipe — same row returned on repeat calls.

export type PublishScope = "execute" | "library" | "menu";

export type PublishCandidateInput = {
  candidate: Pick<MealCandidate, "composedCardDraft">;
  userId: string;
  familyId: string | null;
  scope: PublishScope;
};

export type PublishCandidateResult = {
  parsedRecipeId: string;
  savedRecipeId: string | null;
  alreadyExisted: boolean;
  scope: PublishScope;
};

export class PublishCandidateError extends Error {
  constructor(
    public readonly code: "malformed_card",
    message: string,
  ) {
    super(message);
    this.name = "PublishCandidateError";
  }
}

export async function publishCandidate(
  input: PublishCandidateInput,
): Promise<PublishCandidateResult> {
  const { candidate, userId, familyId, scope } = input;

  const card = candidate.composedCardDraft as unknown as CookCard;
  if (!card?.source_url || !card?.title) {
    throw new PublishCandidateError(
      "malformed_card",
      "candidate.composedCardDraft is missing source_url or title",
    );
  }

  const parsed = await prisma.parsedRecipe.upsert({
    where: { sourceUrl: card.source_url },
    create: {
      sourceUrl: card.source_url,
      title: card.title,
      cardJson: card as unknown as object,
      modelUsed: "planner-candidate",
    },
    update: {
      title: card.title,
      cardJson: card as unknown as object,
    },
  });

  if (scope === "menu") {
    return {
      parsedRecipeId: parsed.id,
      savedRecipeId: null,
      alreadyExisted: false,
      scope,
    };
  }

  // Personal-scope SavedRecipe lookup needs hand-rolled findFirst → create
  // because Postgres treats NULL as distinct in unique constraints (see
  // CLAUDE.md on the NULL-distinct trap).
  const existing = await prisma.savedRecipe.findFirst({
    where: {
      userId,
      parsedRecipeId: parsed.id,
      familyId: familyId ?? null,
    },
  });
  const saved =
    existing ??
    (await prisma.savedRecipe.create({
      data: {
        userId,
        parsedRecipeId: parsed.id,
        familyId: familyId ?? null,
      },
    }));

  return {
    parsedRecipeId: parsed.id,
    savedRecipeId: saved.id,
    alreadyExisted: !!existing,
    scope,
  };
}
