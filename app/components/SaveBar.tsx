"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, ChefHat, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CookCard } from "@/app/types";
import {
  recipeIdFor,
  saveRecipe,
  deleteRecipe,
  markCooked,
  useSavedRecipe,
} from "@/app/lib/storage";

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
  const [justSaved, setJustSaved] = useState(false);

  const isSaved = recipe !== null;

  async function onSave() {
    const saved = await saveRecipe(card);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
    if (variant === "parse") {
      router.push(`/recipe/${saved.id}`);
    }
  }

  async function onCooked() {
    let target = recipe;
    if (!target) target = await saveRecipe(card);
    await markCooked(target.id);
  }

  async function onDelete() {
    if (!confirm(`Remove "${card.title}" from your library?`)) return;
    if (recipe) await deleteRecipe(recipe.id);
    router.push("/library");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 shadow-sm">
      <div className="text-xs text-stone-600">
        {isSaved ? (
          <span className="inline-flex items-center gap-2">
            <BookmarkCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>
              Saved {formatRelative(recipe.savedAt)}
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
