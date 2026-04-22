# Instagram ingestion — one-time Meta setup

One-time Meta developer setup so Recipe Guide can pull media from your own
Instagram account (currently `@postweddingdiet`). Phase-1 uses a manually
pasted access token; phase-3 replaces this with the full OAuth + cron flow.

## 1 — Switch the IG account to Creator (or Business)

Instagram API with Instagram Login only exposes media for Professional
accounts. It's a free toggle and does not change how followers see the
account.

1. Open Instagram → your profile → Settings → Account → "Switch to
   professional account".
2. Pick **Creator**. Any category is fine.
3. Follow the prompts through to the end.

## 2 — Create a Meta developer app

1. Go to <https://developers.facebook.com/apps/> (sign in with the Facebook
   account that controls the IG account).
2. Click "Create app" → choose use case **Other** → type **Consumer** →
   name the app (e.g. "Recipe Guide Ingest").
3. In the app dashboard, find **Instagram** in the sidebar and click "Set
   up" → **API setup with Instagram login**.
4. Under "Business login settings":
   - Redirect URI: any URL you control (phase-1 doesn't use OAuth, but
     Meta requires a value — `https://example.com` works).
   - Permissions: tick `instagram_business_basic`.

## 3 — Add yourself as a tester

An app in Development mode can only read data for testers you've added.

1. In the app dashboard → Roles → **Instagram testers**.
2. Add the IG account (`@postweddingdiet`).
3. Open the IG app → Settings → Apps and websites → Tester invites, and
   accept the invite.

## 4 — Generate an access token (phase-1 manual path)

1. In the Meta app dashboard → Instagram → API setup with Instagram
   login → **Generate token**.
2. Log in with the IG account, approve the `instagram_business_basic`
   scope, and copy the long token it shows you (it's a long-lived token,
   ~60 days).
3. Paste it into Recipe Guide at `/settings/integrations` and hit
   **Connect**, then **Sync now**.

## Troubleshooting

- **`token rejected by Instagram`** — the token is for a personal
  account. Re-check step 1 (the account must be Professional).
- **`no usable image URL on post`** — IG returned a post we can't render
  (unusual media type). Skip it; the sync loop captures the error on the
  `InstagramPost` row and moves on.
- **Token about to expire** — for now, regenerate via step 4 and paste
  again. Phase-3 wires up automatic refresh with `ig_refresh_token`.

## What phase-3 adds

- Real OAuth flow (no pasted tokens).
- A Vercel cron that walks all `InstagramConnection` rows every few hours.
- Long-lived token auto-refresh.
- Per-Family scoping so imports land in a shared library, not just the
  connecting user's personal one.
