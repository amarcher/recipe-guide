"use client";

import { useState } from "react";
import {
  BookmarkCheck,
  Flame,
  Square,
  Trash2,
  Plus,
  Check,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { CookCard } from "@/app/types";
import {
  saveRecipe,
  deleteRecipe,
  recipeIdFor,
  useSavesForCard,
} from "@/app/lib/storage";
import { useMyFamilies } from "@/app/lib/families";
import {
  cancelCookingSession,
  finishCookingSession,
  startCookingSession,
  useCookSession,
} from "@/app/lib/cook-session";

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  const days = Math.floor(diff / day);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString();
}

type Scope = { id: string | null; label: string }; // id null = personal

export function SaveBar({
  card,
  variant = "parse",
}: {
  card: CookCard;
  variant?: "parse" | "detail";
}) {
  const router = useRouter();
  const session = useSession();
  const signedIn = session.status === "authenticated";
  const { families } = useMyFamilies();
  const saves = useSavesForCard(card);
  const [pendingScope, setPendingScope] = useState<string | null | "_none">("_none");
  const localId = recipeIdFor(card);
  const cookSession = useCookSession();
  const isCookingThis = cookSession?.localId === localId;
  const isAnotherCooking = !!cookSession && !isCookingThis;
  const [cookingPending, setCookingPending] = useState(false);

  // For signed-out users, scopes is always just [Personal] (localStorage).
  const scopes: Scope[] = signedIn
    ? [{ id: null, label: "Personal" }, ...families.map((f) => ({ id: f.id, label: f.name }))]
    : [{ id: null, label: "Personal" }];

  // Map scope id → existing save (if any)
  const savedScopeIds = new Set<string | null>(
    saves.map((s) => s.family?.id ?? null)
  );
  const isAnythingSaved = saves.length > 0;

  async function onAddScope(scopeId: string | null) {
    setPendingScope(scopeId);
    try {
      const saved = await saveRecipe(card, { scopes: [scopeId] });
      if (variant === "parse" && !isAnythingSaved) {
        // Only navigate on the FIRST save from the parse view.
        router.push(`/recipe/${saved.id}`);
      }
    } finally {
      setPendingScope("_none");
    }
  }

  async function onRemoveScope(scopeId: string | null) {
    const target = saves.find((s) => (s.family?.id ?? null) === scopeId);
    if (!target) return;
    const label =
      scopes.find((s) => s.id === scopeId)?.label ?? "this library";
    if (!confirm(`Remove "${card.title}" from ${label}?`)) return;
    setPendingScope(scopeId);
    try {
      await deleteRecipe(target.id);
      if (variant === "detail" && saves.length === 1) {
        router.push("/library");
      }
    } finally {
      setPendingScope("_none");
    }
  }

  async function onStartCooking() {
    setCookingPending(true);
    try {
      let target = saves.find((s) => !s.family) ?? saves[0];
      if (!target) {
        target = await saveRecipe(card, { scopes: [null] });
      }
      startCookingSession({
        localId,
        savedId: target.id,
        startedAt: Date.now(),
      });
    } finally {
      setCookingPending(false);
    }
  }
  async function onFinishCooking() {
    setCookingPending(true);
    try {
      await finishCookingSession();
    } finally {
      setCookingPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-stone-600">
          {isAnythingSaved ? (
            <SaveStatus saves={saves} />
          ) : (
            <span className="text-stone-500">Tap a library to save</span>
          )}
        </div>
        {isCookingThis ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onFinishCooking}
              disabled={cookingPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {cookingPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Finish cook
            </button>
            <button
              type="button"
              onClick={cancelCookingSession}
              title="Cancel without recording a cook"
              className="inline-flex items-center rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-500 hover:text-stone-900"
            >
              <Square className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartCooking}
            disabled={cookingPending || isAnotherCooking}
            title={
              isAnotherCooking
                ? "Another cooking session is active — finish it first"
                : "Start a cooking session (keeps the screen awake and persists timers across reloads)"
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {cookingPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Flame className="h-3.5 w-3.5" />
            )}
            Start cooking
          </button>
        )}
      </div>

      {/* Scope chips — one per library, click to toggle */}
      <div className="mt-3 flex flex-wrap gap-2">
        {scopes.map((s) => {
          const isSavedHere = savedScopeIds.has(s.id);
          const isPending = pendingScope === s.id;
          return (
            <button
              key={s.id ?? "personal"}
              type="button"
              onClick={() =>
                isSavedHere ? onRemoveScope(s.id) : onAddScope(s.id)
              }
              disabled={isPending}
              className={`group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${
                isSavedHere
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900"
                  : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
              }`}
              title={isSavedHere ? `Remove from ${s.label}` : `Save to ${s.label}`}
            >
              {isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isSavedHere ? (
                <>
                  <Check className="h-3 w-3 group-hover:hidden" />
                  <Trash2 className="hidden h-3 w-3 group-hover:block" />
                </>
              ) : (
                <Plus className="h-3 w-3" />
              )}
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SaveStatus({ saves }: { saves: ReturnType<typeof useSavesForCard> }) {
  const totalCooks = saves.reduce((s, r) => s + r.cookCount, 0);
  const lastCookedAt = Math.max(0, ...saves.map((s) => s.lastCookedAt ?? 0));
  return (
    <span className="inline-flex items-center gap-2">
      <BookmarkCheck className="h-3.5 w-3.5 text-emerald-600" />
      <span>
        Saved in {saves.length} {saves.length === 1 ? "library" : "libraries"}
        {totalCooks > 0 && (
          <>
            {" · "}
            cooked {totalCooks}× (last {formatRelative(lastCookedAt)})
          </>
        )}
      </span>
    </span>
  );
}
