"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, ChefHat, Trash2, ChevronDown } from "lucide-react";
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
  const [scope, setScope] = useState<string | null>(null); // null = personal
  const [showScope, setShowScope] = useState(false);

  const isSaved = recipe !== null;
  const signedIn = session.status === "authenticated";

  async function onSave() {
    const saved = await saveRecipe(card, { familyId: scope });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
    setShowScope(false);
    if (variant === "parse") {
      router.push(`/recipe/${saved.id}`);
    }
  }

  async function onCooked() {
    let target = recipe;
    if (!target) target = await saveRecipe(card, { familyId: scope });
    await markCooked(target.id);
  }

  async function onDelete() {
    if (!confirm(`Remove "${card.title}" from your library?`)) return;
    if (recipe) await deleteRecipe(recipe.id);
    router.push("/library");
  }

  const scopeLabel =
    scope === null ? "Personal" : families.find((f) => f.id === scope)?.name ?? "Family";

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
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowScope((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              {scopeLabel}
              <ChevronDown className="h-3 w-3" />
            </button>
            {showScope && (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-stone-200 bg-white p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setScope(null);
                    setShowScope(false);
                  }}
                  className={`block w-full rounded px-2 py-1.5 text-left text-xs ${
                    scope === null
                      ? "bg-stone-100 font-medium text-stone-900"
                      : "text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  Personal
                </button>
                {families.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setScope(f.id);
                      setShowScope(false);
                    }}
                    className={`block w-full rounded px-2 py-1.5 text-left text-xs ${
                      scope === f.id
                        ? "bg-stone-100 font-medium text-stone-900"
                        : "text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!isSaved && (
          <button
            type="button"
            onClick={onSave}
            className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700"
          >
            <Bookmark className="h-3.5 w-3.5" />
            {justSaved ? "Saved!" : "Save to library"}
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
