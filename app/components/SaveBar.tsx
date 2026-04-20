"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  ChefHat,
  Trash2,
  ChevronDown,
  Check,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { CookCard } from "@/app/types";
import {
  recipeIdFor,
  saveRecipe,
  deleteRecipe,
  markCooked,
  useSavedRecipe,
} from "@/app/lib/storage";
import { useMyFamilies } from "@/app/lib/families";

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

export function SaveBar({
  card,
  variant = "parse",
}: {
  card: CookCard;
  variant?: "parse" | "detail";
}) {
  const router = useRouter();
  const id = recipeIdFor(card);
  const { recipe } = useSavedRecipe(id);
  const session = useSession();
  const { families } = useMyFamilies();
  const [justSaved, setJustSaved] = useState(false);
  // Selected scopes: null = personal. Defaults to [null].
  const [scopes, setScopes] = useState<Array<string | null>>([null]);
  const [showScope, setShowScope] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);

  const isSaved = recipe !== null;
  const signedIn = session.status === "authenticated";

  useEffect(() => {
    if (!showScope) return;
    function onClick(e: MouseEvent) {
      if (!scopeRef.current?.contains(e.target as Node)) setShowScope(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showScope]);

  function toggleScope(s: string | null) {
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  async function onSave() {
    const targets = scopes.length > 0 ? scopes : [null];
    const saved = await saveRecipe(card, { scopes: targets });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
    setShowScope(false);
    if (variant === "parse") {
      router.push(`/recipe/${saved.id}`);
    }
  }

  async function onCooked() {
    let target = recipe;
    if (!target) target = await saveRecipe(card, { scopes });
    await markCooked(target.id);
  }

  async function onDelete() {
    if (!confirm(`Remove "${card.title}" from your library?`)) return;
    if (recipe) await deleteRecipe(recipe.id);
    router.push("/library");
  }

  const scopeButtonLabel = (() => {
    if (scopes.length === 0) return "Pick a library";
    if (scopes.length === 1) {
      return scopes[0] === null
        ? "Personal"
        : families.find((f) => f.id === scopes[0])?.name ?? "Family";
    }
    return `${scopes.length} libraries`;
  })();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 shadow-sm">
      <div className="text-xs text-stone-600">
        {isSaved ? (
          <span className="inline-flex items-center gap-2">
            <BookmarkCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>
              Saved {formatRelative(recipe.savedAt)}
              {recipe.family && (
                <span className="ml-1 rounded-full bg-stone-100 px-1.5 py-0.5 text-stone-600">
                  {recipe.family.name}
                </span>
              )}
              {recipe.lastCookedAt && (
                <>
                  {" · "}
                  cooked {recipe.cookCount}× (last {formatRelative(recipe.lastCookedAt)})
                </>
              )}
            </span>
          </span>
        ) : (
          <span className="text-stone-500">Not in your library yet</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!isSaved && signedIn && families.length > 0 && (
          <div className="relative" ref={scopeRef}>
            <button
              type="button"
              onClick={() => setShowScope((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              {scopeButtonLabel}
              <ChevronDown className="h-3 w-3" />
            </button>
            {showScope && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-md border border-stone-200 bg-white p-1 shadow-lg">
                <ScopeRow
                  label="Personal"
                  checked={scopes.includes(null)}
                  onToggle={() => toggleScope(null)}
                />
                <div className="my-1 border-t border-stone-100" />
                {families.map((f) => (
                  <ScopeRow
                    key={f.id}
                    label={f.name}
                    checked={scopes.includes(f.id)}
                    onToggle={() => toggleScope(f.id)}
                  />
                ))}
                {families.length > 1 && (
                  <>
                    <div className="my-1 border-t border-stone-100" />
                    <button
                      type="button"
                      onClick={() => setScopes([null, ...families.map((f) => f.id)])}
                      className="block w-full rounded px-2 py-1.5 text-left text-[11px] uppercase tracking-wider text-stone-500 hover:bg-stone-50"
                    >
                      Save to all
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {!isSaved && (
          <button
            type="button"
            onClick={onSave}
            disabled={signedIn && families.length > 0 && scopes.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-60"
          >
            <Bookmark className="h-3.5 w-3.5" />
            {justSaved
              ? "Saved!"
              : scopes.length > 1
              ? `Save to ${scopes.length}`
              : "Save"}
          </button>
        )}
        <button
          type="button"
          onClick={onCooked}
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
        >
          <ChefHat className="h-3.5 w-3.5" />
          I cooked this
        </button>
        {isSaved && variant === "detail" && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
            title="Remove from library"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ScopeRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-50"
    >
      <span
        className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${
          checked
            ? "border-stone-900 bg-stone-900 text-white"
            : "border-stone-300 bg-white"
        }`}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
