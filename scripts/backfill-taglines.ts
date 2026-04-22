import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import type { CookCard } from "@/app/types";

const MODEL = "claude-opus-4-7";

const SYSTEM = `You write a single tagline for a recipe card. The voice is Alison Roman: specific, a little dry, sensory. ≤12 words. Not marketing. One sentence, no quotes, no period if it fits.

Good examples:
- Pink, buttery, a little unhinged.
- Egg yolks, black pepper, the whole dance.
- The bowl you eat on the couch.
- Crisp skin, lemon, no thinking required.

Bad:
- A delicious and healthy family favorite!
- The perfect weeknight meal everyone will love.

Return JUST the tagline. No prose, no quotes around it, no prefix.`;

async function generateTagline(
  anthropic: Anthropic,
  card: CookCard
): Promise<string | null> {
  const stepHeadlines = card.steps.map((s) => s.headline).join(" → ");
  const heroes = card.steps
    .flatMap((s) => s.ingredients.map((i) => i.item))
    .slice(0, 8)
    .join(", ");
  const prompt = `Title: ${card.title}
Arc: ${stepHeadlines}
Ingredients: ${heroes}`;

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 80,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "");
  return text || null;
}

async function main() {
  const anthropic = new Anthropic();
  const rows = await prisma.parsedRecipe.findMany({
    select: { id: true, sourceUrl: true, title: true, cardJson: true },
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const card = row.cardJson as unknown as CookCard;
    if (card?.tagline) {
      skipped++;
      continue;
    }
    try {
      const tagline = await generateTagline(anthropic, card);
      if (!tagline) {
        failed++;
        console.warn(`  skipped (empty): ${row.title}`);
        continue;
      }
      const nextCard = { ...card, tagline };
      await prisma.parsedRecipe.update({
        where: { id: row.id },
        data: { cardJson: nextCard as unknown as object },
      });
      updated++;
      console.log(`  ✓ ${row.title} — "${tagline}"`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${row.title}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(
    `\nDone. ${updated} updated, ${skipped} already had taglines, ${failed} failed.`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
