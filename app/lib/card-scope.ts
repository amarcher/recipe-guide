// Given a SavedRecipe scope, return the (userId, familyId) tuple identifying
// the RecipeOverride row the scope should write/read. Personal-scope saves
// have one override per saver; family-scope saves share one override across
// all members. Pulled out of card-resolver so it stays unit-testable without
// pulling Prisma into vitest's import graph.
export function overrideScopeFor(saved: {
  userId: string;
  familyId: string | null;
}): { userId: string | null; familyId: string | null } {
  return saved.familyId === null
    ? { userId: saved.userId, familyId: null }
    : { userId: null, familyId: saved.familyId };
}
