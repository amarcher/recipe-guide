// Roadmap items 2.17 + 2.19 + 2.20 — opaque, URL-safe random tokens for
// publicly-shared artifacts (Hosted Menu slugs, grocery share tokens,
// recipe share tokens).
//
// 16 bytes ≈ 22 chars at base64url. Collision space ~3.4e38; we don't
// retry on collision because the chance is negligible — the unique
// constraint catches it. Kept in a Prisma-free module so vitest can use
// it; webcrypto is universally available in Node 18+ and the browser.

function base64url(bytes: Uint8Array): string {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  // btoa works in the Edge runtime; in Node we have it as a global since 16+.
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomToken(byteLen = 16): string {
  const bytes = new Uint8Array(byteLen);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Last-resort fallback. Should never hit on Node 18+.
    for (let i = 0; i < byteLen; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return base64url(bytes);
}

// Hosted-menu-friendly slug. Adjective-noun-token shape, but in v1 we just
// emit a token — content moderation can be tightened later (decision #2 /
// 2026-04-28).
export function publishedMenuSlug(): string {
  return randomToken(8);
}
