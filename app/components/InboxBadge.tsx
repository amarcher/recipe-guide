"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

// Roadmap item 2.21 — small unread-count badge on the header inbox link.
// Polls the notifications endpoint every 30s; the SSE channel from item
// 2.13 will replace the polling once the family-events hook is wired
// here as a follow-up.

export function InboxBadge() {
  const session = useSession();
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (session.status !== "authenticated") return;
    let cancelled = false;
    async function refresh() {
      try {
        const r = await fetch("/api/notifications", { cache: "no-store" });
        if (!r.ok) return;
        const body = (await r.json()) as { unreadCount: number };
        if (!cancelled) setCount(body.unreadCount);
      } catch {}
    }
    void refresh();
    const t = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [session.status]);

  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}
