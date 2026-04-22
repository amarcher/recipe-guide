// Instagram Graph API (v21.0) wrapper. Only covers the consumer-read flow:
// list media for the authenticated IG account, refresh a long-lived token.
// The app switched to "Instagram API with Instagram Login" in 2024 (Basic
// Display was sunset Dec 4 2024), so we hit graph.instagram.com with an IG
// user access token — not a Facebook page token.

const GRAPH = "https://graph.instagram.com";
const API_VERSION = "v21.0";

const MEDIA_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "timestamp",
  "children{id,media_type,media_url,thumbnail_url}",
].join(",");

export type IgMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";

export type IgMedia = {
  id: string;
  caption?: string;
  media_type: IgMediaType;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string; // ISO8601
  children?: {
    data: Array<{
      id: string;
      media_type: IgMediaType;
      media_url?: string;
      thumbnail_url?: string;
    }>;
  };
};

export type IgMediaPage = {
  data: IgMedia[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
};

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}/${API_VERSION}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Instagram API ${res.status} on ${path}: ${body.slice(0, 400)}`
    );
  }
  return (await res.json()) as T;
}

export async function fetchMyAccount(
  accessToken: string
): Promise<{ id: string; username: string }> {
  return graphGet("/me", {
    fields: "id,username",
    access_token: accessToken,
  });
}

// One page of the user's media, newest first. `after` cursor paginates
// backward in time.
export async function fetchMediaPage(
  accessToken: string,
  opts: { after?: string; limit?: number } = {}
): Promise<IgMediaPage> {
  const params: Record<string, string> = {
    fields: MEDIA_FIELDS,
    access_token: accessToken,
    limit: String(opts.limit ?? 25),
  };
  if (opts.after) params.after = opts.after;
  return graphGet<IgMediaPage>("/me/media", params);
}

// Refresh a long-lived token. Tokens last ~60 days and can be refreshed any
// time after 24h of age. Returns a new token that replaces the old.
export async function refreshLongLivedToken(
  accessToken: string
): Promise<{ access_token: string; expires_in: number }> {
  return graphGet("/refresh_access_token", {
    grant_type: "ig_refresh_token",
    access_token: accessToken,
  });
}

// Exchange a short-lived token (from OAuth or Graph Explorer) for a
// long-lived one (60-day). Phase-3 OAuth uses this; the manual-connect dev
// route calls it once after the user pastes a short-lived token.
export async function exchangeForLongLivedToken(
  shortToken: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  return graphGet("/access_token", {
    grant_type: "ig_exchange_token",
    client_secret: clientSecret,
    access_token: shortToken,
  });
}

// Pick the best image URL for a post. Carousels: first child's image.
// Videos: thumbnail_url. Images: media_url.
export function pickImageUrl(m: IgMedia): string | null {
  if (m.media_type === "IMAGE") return m.media_url ?? null;
  if (m.media_type === "VIDEO") return m.thumbnail_url ?? null;
  if (m.media_type === "CAROUSEL_ALBUM") {
    const child = m.children?.data.find((c) => c.media_type !== "VIDEO");
    if (child?.media_url) return child.media_url;
    const anyChild = m.children?.data[0];
    return anyChild?.thumbnail_url ?? anyChild?.media_url ?? null;
  }
  return null;
}

// Pick the best video URL (or null for image-only posts).
export function pickVideoUrl(m: IgMedia): string | null {
  if (m.media_type === "VIDEO") return m.media_url ?? null;
  if (m.media_type === "CAROUSEL_ALBUM") {
    const vid = m.children?.data.find((c) => c.media_type === "VIDEO");
    return vid?.media_url ?? null;
  }
  return null;
}
