import { put } from "@vercel/blob";
import { prisma } from "@/app/lib/prisma";
import type { CookCard } from "@/app/types";

// Server-side helper that mirrors scripts/generate-candidate-dish-photos.ts
// for *new* candidates created via the candidates API. Fires from `after()`
// in app/api/plans/[id]/candidates/route.ts so the response returns before
// the (slow) generation work runs.
//
// No-op unless IMAGE_GEN_URL is set, so production deployments without a
// reachable image-gen server skip cleanly. Dev sessions running the local
// MLX server at localhost:8000 get auto-filled candidate photos.
//
// Best-effort: any individual failure is swallowed. The npm script
// `candidate-dish-photos` is the durable recovery path.

const GEN_WIDTH = 1024;
const GEN_HEIGHT = 768;
const PER_CALL_TIMEOUT_MS = 180_000;

export async function backfillCandidateDishPhotos(
  candidateIds: string[]
): Promise<void> {
  const url = process.env.IMAGE_GEN_URL;
  if (!url || candidateIds.length === 0) return;

  // Quick health check — avoid 5×180s of timeouts when the server is down.
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return;
  } catch {
    return;
  }

  for (const id of candidateIds) {
    try {
      const c = await prisma.mealCandidate.findUnique({
        where: { id },
        select: { id: true, title: true, composedCardDraft: true },
      });
      if (!c) continue;
      const card = c.composedCardDraft as unknown as CookCard | null;
      if (!card || card.generated_dish_image_url) continue;

      const r = await fetch(`${url}/dish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: c.title,
          hero_ingredients: [],
          width: GEN_WIDTH,
          height: GEN_HEIGHT,
        }),
        signal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
      });
      if (!r.ok) continue;
      const jpeg = Buffer.from(await r.arrayBuffer());

      const blob = await put(`dishes/candidate/${id}.jpg`, jpeg, {
        access: "public",
        addRandomSuffix: false,
        contentType: "image/jpeg",
        allowOverwrite: true,
      });

      await prisma.mealCandidate.update({
        where: { id },
        data: {
          composedCardDraft: {
            ...card,
            generated_dish_image_url: blob.url,
          } as unknown as object,
        },
      });
    } catch {
      // best-effort; npm run candidate-dish-photos is the recovery path.
    }
  }
}
