import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";
// Disable Vercel's data cache; this is a streaming endpoint.
export const dynamic = "force-dynamic";

// Roadmap item 2.13 — per-family SSE channel. Vercel Fluid Compute caps
// long-running responses, so we chunk to ~60s reconnects with DB-backed
// reconciliation: client passes `since=<ms>` on reconnect and gets every
// event with createdAt > since. Neon's serverless driver doesn't support
// LISTEN/NOTIFY over WebSocket (that's a session-state feature), so we
// poll Postgres at ~2s intervals from inside the stream — same effective
// latency as LISTEN/NOTIFY for the household-scale event volume we expect.
//
// 5s polling fallback ships at the same path with `?mode=poll`, returning
// JSON instead of an event stream — for browsers that throttle SSE on
// background tabs or for retries when the stream itself fails.

const STREAM_DURATION_MS = 55_000;
const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

type EventRow = {
  id: string;
  kind: string;
  planId: string | null;
  savedRecipeId: string | null;
  payload: unknown;
  actorId: string | null;
  createdAt: Date;
};

async function ensureMember(
  userId: string,
  familyId: string,
): Promise<boolean> {
  const m = await prisma.familyMember.findUnique({
    where: { userId_familyId: { userId, familyId } },
    select: { userId: true },
  });
  return !!m;
}

async function fetchEvents(
  familyId: string,
  sinceMs: number,
): Promise<EventRow[]> {
  return prisma.familyEvent.findMany({
    where: {
      familyId,
      createdAt: { gt: new Date(sinceMs) },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      kind: true,
      planId: true,
      savedRecipeId: true,
      payload: true,
      actorId: true,
      createdAt: true,
    },
  });
}

function serializeEvent(e: EventRow): Record<string, unknown> {
  return {
    id: e.id,
    kind: e.kind,
    planId: e.planId,
    savedRecipeId: e.savedRecipeId,
    payload: e.payload,
    actorId: e.actorId,
    createdAt: e.createdAt.getTime(),
  };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user)
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  const { id: familyId } = await ctx.params;
  if (!(await ensureMember(user.userId, familyId))) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const sinceMs = sinceParam ? Number(sinceParam) : Date.now() - 30_000;
  const mode = url.searchParams.get("mode") ?? "stream";

  // Polling-only fallback — returns a JSON snapshot up to "now".
  if (mode === "poll") {
    const events = await fetchEvents(familyId, sinceMs);
    return new Response(
      JSON.stringify({
        events: events.map(serializeEvent),
        until: Date.now(),
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      },
    );
  }

  // SSE stream. Encoder is reused across writes; a small backlog flushes on
  // first connect, then we poll Postgres every 2s for ~55s before suggesting
  // the client reconnect.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastSeen = sinceMs;
      let aborted = false;
      const close = () => {
        if (aborted) return;
        aborted = true;
        try {
          controller.close();
        } catch {}
      };

      // Abort cleanly when the client disconnects.
      req.signal.addEventListener("abort", close);

      function send(event: string, data: Record<string, unknown>) {
        if (aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          aborted = true;
        }
      }

      send("hello", { until: Date.now(), familyId });

      const tickStart = Date.now();
      let lastHeartbeat = tickStart;

      while (!aborted && Date.now() - tickStart < STREAM_DURATION_MS) {
        try {
          const events = await fetchEvents(familyId, lastSeen);
          for (const e of events) {
            send("event", serializeEvent(e));
            lastSeen = Math.max(lastSeen, e.createdAt.getTime());
          }
          if (Date.now() - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
            send("heartbeat", { now: Date.now() });
            lastHeartbeat = Date.now();
          }
        } catch (err) {
          send("error", {
            message: err instanceof Error ? err.message : "poll failed",
          });
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      // Suggest the client reconnect with `?since=<lastSeen>`.
      send("reconnect", { since: lastSeen });
      close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
