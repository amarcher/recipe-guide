"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { Camera, Loader2, RefreshCw, Unplug } from "lucide-react";
import { refreshSavedRecipes } from "@/app/lib/storage";
import { useConfirm } from "@/app/components/ConfirmDialog";

type ConnectionInfo = {
  id: string;
  username: string | null;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  _count: { posts: number };
};

type PostInfo = {
  postId: string;
  permalink: string;
  postedAt: string;
  mediaType: string;
  caption: string | null;
  processedAt: string | null;
  processingError: string | null;
  savedRecipeId: string | null;
  thumbnailBlobUrl: string | null;
};

type ConnectResponse = {
  connection: ConnectionInfo | null;
  counts?: { imported: number; errored: number };
  posts?: PostInfo[];
};

type SyncOutcome = {
  scanned: number;
  imported: number;
  skipped: number;
  errors: number;
  hasMore: boolean;
  details: Array<{ postId: string; status: string; message?: string }>;
};

export default function IntegrationsPage() {
  const session = useSession();
  const confirm = useConfirm();
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [counts, setCounts] = useState<{ imported: number; errored: number } | null>(null);
  const [posts, setPosts] = useState<PostInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncOutcome | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const loading = session.status === "loading" || (session.status === "authenticated" && !loaded);

  const loadConnection = useCallback(async () => {
    try {
      const r = await fetch("/api/integrations/instagram/connect");
      if (!r.ok) {
        setConnection(null);
        setCounts(null);
        setPosts([]);
        return;
      }
      const body = (await r.json()) as ConnectResponse;
      setConnection(body.connection);
      setCounts(body.counts ?? null);
      setPosts(body.posts ?? []);
    } finally {
      setLoaded(true);
    }
  }, []);

  const authed = session.status === "authenticated";
  useEffect(() => {
    if (!authed) return;
    void loadConnection();
  }, [authed, loadConnection]);

  // While a sync is in flight, poll every 5s so the post list + counts
  // advance in real time. The server-side sync can take a minute or two.
  useEffect(() => {
    if (!syncing) return;
    const t = setInterval(() => void loadConnection(), 5000);
    return () => clearInterval(t);
  }, [syncing, loadConnection]);

  async function onConnect() {
    if (!token.trim()) return;
    setConnecting(true);
    setErr(null);
    try {
      const r = await fetch("/api/integrations/instagram/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: token.trim() }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error ?? r.statusText);
      setToken("");
      await loadConnection();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "connect failed");
    } finally {
      setConnecting(false);
    }
  }

  async function onSync() {
    setSyncing(true);
    setErr(null);
    setSyncResult(null);
    try {
      const r = await fetch("/api/integrations/instagram/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error ?? r.statusText);
      setSyncResult(body as SyncOutcome);
      await refreshSavedRecipes();
      await loadConnection();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function onDisconnect() {
    const ok = await confirm({
      title: "Disconnect Instagram?",
      message:
        "Imported recipes stay in your library. You can reconnect any time, but you'll need a fresh access token.",
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (!ok) return;
    await fetch("/api/integrations/instagram/disconnect", { method: "POST" });
    await loadConnection();
    setSyncResult(null);
  }

  if (session.status !== "authenticated") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <p className="text-sm text-stone-600">Sign in to manage integrations.</p>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/settings/integrations" })}
          className="inline-flex items-center rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          Sign in with Google
        </button>
        <Link href="/" className="text-sm font-medium text-stone-900 underline">
          Back home
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div>
          <Link
            href="/settings"
            className="text-xs uppercase tracking-wider text-stone-500 hover:text-stone-900"
          >
            ← Settings
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
            Integrations
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Pull cooked-before recipes from other places you&rsquo;ve logged them.
          </p>
        </div>

        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Camera className="mt-0.5 h-5 w-5 flex-none text-stone-700" />
            <div className="flex-1">
              <h2 className="text-base font-semibold text-stone-900">
                Instagram
              </h2>
              <p className="mt-0.5 text-sm text-stone-600">
                Every post becomes a library tile — looping hero video,
                ingredient guess, and a reconstructed guide you can still cook from.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-stone-400">Loading…</p>
          ) : connection ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-700">
                Connected as{" "}
                <span className="font-medium">@{connection.username}</span>.{" "}
                {connection._count.posts} post
                {connection._count.posts === 1 ? "" : "s"} seen
                {counts && (
                  <>
                    {" "}·{" "}
                    <span className="text-emerald-700">
                      {counts.imported} imported
                    </span>
                    {counts.errored > 0 && (
                      <>
                        {" "}·{" "}
                        <span className="text-rose-700">
                          {counts.errored} errored
                        </span>
                      </>
                    )}
                  </>
                )}
                .{" "}
                {syncing ? (
                  <span className="text-amber-800">
                    Syncing now — this takes ~15–20 seconds per post.
                  </span>
                ) : connection.lastSyncedAt ? (
                  <>
                    Last sync:{" "}
                    {new Date(connection.lastSyncedAt).toLocaleString()}.
                  </>
                ) : (
                  <>Never synced.</>
                )}
                {connection.tokenExpiresAt && (
                  <>
                    {" "}Token expires{" "}
                    {new Date(connection.tokenExpiresAt).toLocaleDateString()}.
                  </>
                )}
              </div>

              {connection.lastSyncError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  Last sync error: {connection.lastSyncError}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onSync}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
                >
                  {syncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  <Unplug className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              </div>

              {syncResult && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  Scanned {syncResult.scanned} · imported{" "}
                  {syncResult.imported} · skipped {syncResult.skipped}
                  {syncResult.errors > 0 && (
                    <> · {syncResult.errors} errored</>
                  )}
                  .{syncResult.hasMore && (
                    <>
                      {" "}More posts remain on Instagram —{" "}
                      <button
                        type="button"
                        onClick={onSync}
                        className="underline hover:no-underline"
                      >
                        sync again
                      </button>{" "}
                      to continue.
                    </>
                  )}
                </div>
              )}

              {posts.length > 0 && (
                <div className="rounded-md border border-stone-200 bg-stone-50">
                  <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
                    <span>Recent posts</span>
                    <button
                      type="button"
                      onClick={() => void loadConnection()}
                      className="text-[11px] font-medium normal-case tracking-normal text-stone-600 hover:text-stone-900"
                    >
                      Refresh
                    </button>
                  </div>
                  <ul className="divide-y divide-stone-200">
                    {posts.map((p) => (
                      <li
                        key={p.postId}
                        className="flex items-start gap-3 px-3 py-2"
                      >
                        {p.thumbnailBlobUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.thumbnailBlobUrl}
                            alt=""
                            className="h-10 w-10 flex-none rounded object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 flex-none rounded bg-stone-200" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2 text-[12px]">
                            <a
                              href={p.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-stone-500 hover:text-stone-900"
                            >
                              {p.postId.slice(0, 10)}…
                            </a>
                            <span className="text-stone-400">
                              {new Date(p.postedAt).toLocaleDateString()}
                            </span>
                            <span className="text-stone-400">
                              {p.mediaType.toLowerCase().replace("_", " ")}
                            </span>
                            {p.savedRecipeId && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                                imported
                              </span>
                            )}
                            {!p.processedAt && p.processingError && (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-800">
                                error
                              </span>
                            )}
                            {!p.processedAt && !p.processingError && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                                pending
                              </span>
                            )}
                          </div>
                          {p.caption && (
                            <p className="mt-0.5 line-clamp-2 text-[12px] text-stone-600">
                              {p.caption}
                            </p>
                          )}
                          {p.processingError && (
                            <p className="mt-0.5 line-clamp-2 text-[12px] text-rose-700">
                              {p.processingError}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-stone-600">
                Paste an Instagram access token to connect. See{" "}
                <code className="rounded bg-stone-100 px-1 py-0.5 text-[12px]">
                  docs/instagram-setup.md
                </code>{" "}
                for how to generate one.
              </p>
              <textarea
                rows={3}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="IGQWRO… (paste token here)"
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
              />
              <button
                type="button"
                onClick={onConnect}
                disabled={connecting || !token.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
              >
                {connecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
                {connecting ? "Verifying…" : "Connect"}
              </button>
            </div>
          )}

          {err && (
            <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {err}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
