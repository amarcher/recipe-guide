"use client";

import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import {
  useFamilyEvents,
  type FamilyEvent,
} from "@/app/lib/family-events-client";
import { refreshRemoteMise } from "@/app/lib/storage";

// Roadmap item 2.14 — Meezing presence ribbon. SaveBar composes this when
// the recipe is family-scoped and Family.syncExecution is true. Lives in
// the SaveBar slot — does NOT touch CookCardView, MisePlace, or the
// execution layer.
//
// Behavior:
//   - Subscribes to the family event channel (2.13).
//   - When a `mise.checked` / `mise.unchecked` event arrives for THIS
//     recipe, refresh the local mise cache so MisePlace re-renders.
//   - When ANY event arrives carrying actorId from the family (within the
//     last 90s), surface that actor in the presence ribbon.
//
// We deliberately do NOT add a sound, vibration, or alarm channel — per the
// "alarms stay starter-only" constraint.

export type MeezingActor = {
  id: string;
  name?: string | null;
  image?: string | null;
};

export function MeezingRibbon({
  familyId,
  savedRecipeId,
  members,
}: {
  familyId: string;
  savedRecipeId: string;
  members: MeezingActor[];
}) {
  const [activeActorIds, setActiveActorIds] = useState<Map<string, number>>(
    () => new Map(),
  );

  // Subscribe to family events. The hook handles SSE + polling fallback.
  const { status } = useFamilyEvents(familyId, {
    onEvent: (e: FamilyEvent) => {
      if (e.savedRecipeId === savedRecipeId) {
        if (e.kind === "mise.checked" || e.kind === "mise.unchecked" || e.kind === "mise.reset") {
          void refreshRemoteMise(savedRecipeId);
        }
      }
      if (e.actorId) {
        setActiveActorIds((prev) => {
          const next = new Map(prev);
          next.set(e.actorId!, Date.now());
          return next;
        });
      }
    },
  });

  // Expire actors that haven't pinged in 90s.
  useEffect(() => {
    const t = setInterval(() => {
      setActiveActorIds((prev) => {
        const cutoff = Date.now() - 90_000;
        let changed = false;
        const next = new Map<string, number>();
        for (const [id, ts] of prev) {
          if (ts >= cutoff) {
            next.set(id, ts);
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 15_000);
    return () => clearInterval(t);
  }, []);

  const presentActors = useMemo(() => {
    return members.filter((m) => activeActorIds.has(m.id));
  }, [members, activeActorIds]);

  if (presentActors.length === 0) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-[11px] text-stone-500">
        <Users className="h-3 w-3" />
        Meezing on — your family will see your mise checks live.
        {status === "polling" && (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-stone-400">
            polling
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-900">
      <span className="flex -space-x-1.5">
        {presentActors.slice(0, 4).map((a) => (
          <ActorBubble key={a.id} actor={a} />
        ))}
      </span>
      <span>
        {presentActors.length === 1
          ? `${presentActors[0].name ?? "Someone"} is here too`
          : `${presentActors.length} family members in this recipe`}
      </span>
    </div>
  );
}

function ActorBubble({ actor }: { actor: MeezingActor }) {
  const initial = (actor.name ?? "?").trim().charAt(0).toUpperCase();
  if (actor.image) {
    return (
      <span
        className="inline-block h-5 w-5 overflow-hidden rounded-full bg-stone-200 ring-2 ring-emerald-50"
        title={actor.name ?? "family member"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={actor.image}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[9px] font-semibold text-emerald-900 ring-2 ring-emerald-50"
      title={actor.name ?? "family member"}
    >
      {initial}
    </span>
  );
}
