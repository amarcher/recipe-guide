// Roadmap items 3.1 + 3.2 — vendor-agnostic deep-link grocery export.
//
// The shape is deliberately partner-swappable: each vendor is a pure
// `(items) => url` function so a future PR can promote Instacart or Walmart
// from stub-only to UI-wired without rewriting the export surface. v1 only
// wires AmazonFresh into the planner UI per the 2026-04-28 decision.
//
// Pure functions only — no Prisma, no client APIs. Tested at
// `grocery-vendors.test.ts` (vitest has no path-alias setup; keep this
// module Prisma-free).
//
// AmazonFresh URL shape (chosen for v1):
//   https://www.amazon.com/s?k=<encoded query>&i=amazonfresh
// Reasoning:
//   - Anchors the search inside the AmazonFresh storefront via `i=amazonfresh`,
//     so results are limited to Fresh-fulfilled SKUs in markets where it's
//     supported. Falls back to general grocery for non-Fresh ZIPs.
//   - A single search URL beats N tabs; Amazon's relevance-ranking surfaces
//     the first matching item near the top of the page.
//   - The full list lands on the clipboard via the UI's copy fallback so the
//     user can paste-add the rest of the cart without losing items.
//   - Amazon caps URL length around ~2000 chars; we hard-cap the link to the
//     first 5 items by default and keep the FULL list on the clipboard.
//
// If we ever need to push the entire cart programmatically, that's the
// territory of 3.2's partner-API integration (OAuth, multi-week, parked).

export type ExportItem = {
  /** Display label as shown in the grocery list (e.g. "olive oil"). */
  display: string;
  /** Stable ingredient slug if the rollup matched one. */
  slug?: string | null;
  /** Free-text quantity string (e.g. "2 lbs"). Optional — most search */
  /** engines ignore it, but Walmart's URL builder accepts it. */
  quantity?: string | null;
  /** Free-text unit (e.g. "lb"). Same caveat as quantity. */
  unit?: string | null;
};

export type GroceryVendor = {
  /** Stable id used in API bodies and event payloads. */
  id: "amazonFresh" | "instacart" | "walmart";
  /** User-facing label. */
  label: string;
  /** Build a deep link from items. Pure function, must not throw. */
  deeplink: (items: ExportItem[]) => string;
  /**
   * Optional support check (ZIP-based regional gating). Returns true when
   * the vendor is known to serve the given ZIP. v1 returns true for all
   * vendors; gated regional filtering lands when we have geocoding signal.
   */
  supports?: (zip?: string) => boolean;
};

/** Default item cap for the deeplink itself. The full list still lands on */
/** the clipboard via the UI; the URL just primes the first matches. */
export const AMAZON_FRESH_DEEPLINK_ITEM_CAP = 5;

/**
 * URL-length guardrail. Amazon caps at ~2KB; we stop concatenating items
 * once the encoded query would exceed `MAX_DEEPLINK_QUERY_LEN` characters.
 * Whatever didn't fit lands on the clipboard.
 */
export const MAX_DEEPLINK_QUERY_LEN = 1500;

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Pick the most useful name to send to a vendor. Prefer the display label
 * (which is what a human would type), fall back to the slug.
 */
function vendorName(item: ExportItem): string {
  const display = normalize(item.display ?? "");
  if (display) return display;
  const slug = (item.slug ?? "").replace(/[-_]+/g, " ").trim();
  return slug;
}

/**
 * Join items into a single search query, keeping the URL under
 * `MAX_DEEPLINK_QUERY_LEN` once URL-encoded. Returns the joined query plus
 * the count of items that actually fit so the caller can surface
 * "and N more on the clipboard."
 */
export function composeQuery(
  items: ExportItem[],
  opts: { itemCap?: number; maxLen?: number } = {},
): { query: string; usedCount: number } {
  const itemCap = opts.itemCap ?? AMAZON_FRESH_DEEPLINK_ITEM_CAP;
  const maxLen = opts.maxLen ?? MAX_DEEPLINK_QUERY_LEN;
  const tokens: string[] = [];
  let used = 0;
  for (const item of items) {
    if (used >= itemCap) break;
    const name = vendorName(item);
    if (!name) continue;
    const next = tokens.length === 0 ? name : `${tokens.join(" ")} ${name}`;
    if (encodeURIComponent(next).length > maxLen) break;
    tokens.push(name);
    used += 1;
  }
  return { query: tokens.join(" "), usedCount: used };
}

/**
 * Plain-text list (one per line) suitable for clipboard fallback.
 * Includes quantity hints when present so a paste into a cart reads cleanly.
 */
export function clipboardList(items: ExportItem[]): string {
  return items
    .map((item) => {
      const name = vendorName(item);
      if (!name) return null;
      const qty = (item.quantity ?? "").trim();
      return qty ? `${qty} ${name}` : name;
    })
    .filter((line): line is string => !!line)
    .join("\n");
}

const amazonFresh: GroceryVendor = {
  id: "amazonFresh",
  label: "AmazonFresh",
  deeplink(items) {
    const { query } = composeQuery(items);
    if (!query) {
      // Empty cart — still return a usable storefront landing so the button
      // never produces a 404. Amazon happily renders the bare search page.
      return "https://www.amazon.com/alm/storefront?almBrandId=QW1hem9uIEZyZXNo";
    }
    return `https://www.amazon.com/s?k=${encodeURIComponent(query)}&i=amazonfresh`;
  },
};

// Stubs — present so the adapter abstraction is testable and so promoting
// either to UI-wired is a single boolean flip plus a button copy change.
// The URL shapes below are best-effort search endpoints, not partner APIs.

const instacart: GroceryVendor = {
  id: "instacart",
  label: "Instacart",
  deeplink(items) {
    const { query } = composeQuery(items);
    if (!query) return "https://www.instacart.com/store";
    return `https://www.instacart.com/store/s?k=${encodeURIComponent(query)}`;
  },
};

const walmart: GroceryVendor = {
  id: "walmart",
  label: "Walmart",
  deeplink(items) {
    const { query } = composeQuery(items);
    if (!query) return "https://www.walmart.com/cp/grocery/976759";
    return `https://www.walmart.com/search?q=${encodeURIComponent(query)}&cat_id=976759`;
  },
};

export const GROCERY_VENDORS = {
  amazonFresh,
  instacart,
  walmart,
} as const satisfies Record<GroceryVendor["id"], GroceryVendor>;

export type GroceryVendorId = keyof typeof GROCERY_VENDORS;

export const GROCERY_VENDOR_IDS = Object.keys(
  GROCERY_VENDORS,
) as GroceryVendorId[];

export function getVendor(id: string): GroceryVendor | null {
  if ((id as GroceryVendorId) in GROCERY_VENDORS) {
    return GROCERY_VENDORS[id as GroceryVendorId];
  }
  return null;
}

/** v1 default. Decision settled 2026-04-28. */
export const DEFAULT_GROCERY_VENDOR: GroceryVendorId = "amazonFresh";
