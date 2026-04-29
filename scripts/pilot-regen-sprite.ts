// One-shot pilot: regenerate a single orphan sprite with OpenAI gpt-image-1
// using an inline transparent-background prompt. Also deletes the
// `tomato-pur-e` mojibake blobs in the same run so we don't ship them again.
//
// Usage:
//   node --env-file=.env.local --import tsx scripts/pilot-regen-sprite.ts <slug> <label> [compose]
//
// Examples:
//   node ... pilot-regen-sprite.ts harissa-paste "harissa paste" puddle
//
// `compose` is optional; supported: "puddle" | "carafe".

import { put, del, head } from "@vercel/blob";
import sharp from "sharp";

const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/images/generations";

const STYLE_TRANSPARENT = `A photorealistic, high-resolution studio product photograph of {label}, isolated subject floating in empty space. CRITICAL: the background must be FULLY TRANSPARENT — every single pixel that is not part of the subject itself must have alpha = 0. Do NOT paint any surface, table, ground, plate, cutting board, countertop, gradient, color wash, or shadow on a ground. Do NOT add any cream, beige, white, or other colored area beneath, around, or behind the subject. The subject is centered with generous padding of pure transparency around it. Sharp focus, true-to-life colors, realistic surface textures, gentle soft-box lighting from upper-left, subtle ambient occlusion only on the subject itself. The image should read like a premium cookbook ingredient cut out from its surroundings — as if it could be placed on any background later and feel native. Maintain consistency across the set: same lighting direction, same neutral white-balance, similar camera distance, similar visual weight, so the sprites feel like a coherent series.`;

const COMPOSE: Record<string, string> = {
  puddle: `Render the {label} as a small dollop or pool on a plain white shallow ceramic saucer — just enough vessel for the paste/sauce to read clearly. CRITICAL: the saucer floats in empty transparent space with absolutely NOTHING beneath, around, or behind it. Do not paint a table, surface, ground, floor, countertop, or any colored area. Do not paint a shadow on a ground (the saucer's own ambient occlusion is fine). Every pixel that is not the saucer or its contents must be fully transparent (alpha = 0).`,
  carafe: `Render the {label} inside a small clear glass carafe with a stopper, the liquid color clearly visible. CRITICAL: the carafe floats in empty transparent space with absolutely NOTHING beneath, around, or behind it. Do not paint a table, surface, ground, floor, countertop, or any colored area. Do not paint a shadow on a ground. Every pixel that is not the carafe or its contents must be fully transparent (alpha = 0).`,
};

function buildPrompt(label: string, compose?: string): string {
  let p = STYLE_TRANSPARENT.replace("{label}", label);
  if (compose && COMPOSE[compose]) {
    p += " " + COMPOSE[compose].replace("{label}", label);
  }
  return p;
}

async function generateOpenAI(prompt: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      prompt,
      size: "1024x1024",
      background: "transparent",
      n: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("no b64_json in OpenAI response");
  return Buffer.from(b64, "base64");
}

async function deleteBlobIfExists(pathname: string, token: string) {
  try {
    const meta = await head(pathname, { token });
    await del(meta.url, { token });
    console.log(`  deleted ${pathname}`);
  } catch {
    console.log(`  ${pathname} not found, skipping delete`);
  }
}

async function main() {
  const [, , slug, label, compose] = process.argv;
  if (!slug || !label) {
    console.error("usage: pilot-regen-sprite.ts <slug> <label> [compose]");
    process.exit(1);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN not set");

  // Side quest: drop the mojibake tomato-pur-e blobs once and for all.
  console.log("Deleting tomato-pur-e (mojibake) ...");
  await deleteBlobIfExists("sprites/tomato-pur-e.png", token);
  await deleteBlobIfExists("sprites/originals/tomato-pur-e.png", token);

  console.log(`\nRegenerating ${slug} (label="${label}", compose=${compose ?? "<none>"}) ...`);
  const prompt = buildPrompt(label, compose);
  console.log(`Prompt: ${prompt}`);
  console.log("");

  const raw = await generateOpenAI(prompt, apiKey);
  console.log(`OpenAI returned ${raw.length} bytes`);

  const display = await sharp(raw)
    .resize(512, 512, { fit: "inside" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const originalPath = `sprites/originals/${slug}.png`;
  const displayPath = `sprites/${slug}.png`;

  const [orig, disp] = await Promise.all([
    put(originalPath, raw, {
      access: "public",
      token,
      addRandomSuffix: false,
      contentType: "image/png",
      allowOverwrite: true,
    }),
    put(displayPath, display, {
      access: "public",
      token,
      addRandomSuffix: false,
      contentType: "image/png",
      allowOverwrite: true,
    }),
  ]);
  console.log(`\nDisplay: ${disp.url}`);
  console.log(`Original: ${orig.url}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
