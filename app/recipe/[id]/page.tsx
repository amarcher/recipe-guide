"use client";

import { use } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSavedRecipe } from "@/app/lib/storage";
import { CookCardView } from "@/app/components/CookCardView";
import { SaveBar } from "@/app/components/SaveBar";
import { CookHistory } from "@/app/components/CookHistory";

export default function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { recipe, loaded } = useSavedRecipe(id);
  const session = useSession();
  const signedIn = session.status === "authenticated";

  return (
    <main className="flex flex-1 flex-col px-4 py-6 sm:py-10">
      {!loaded ? (
        <div className="mx-auto text-sm text-stone-400">Loading…</div>
      ) : !recipe ? (
        <div className="mx-auto w-full max-w-3xl rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <p className="text-sm text-stone-600">
            That recipe isn’t saved on this device.{" "}
            <Link href="/library" className="font-medium text-stone-900 underline">
              Open your library
            </Link>{" "}
            or{" "}
            <Link href="/" className="font-medium text-stone-900 underline">
              parse a new one
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <SaveBar card={recipe.card} variant="detail" />
          {signedIn && <CookHistory recipeId={recipe.id} />}
          <CookCardView card={recipe.card} />
        </div>
      )}
    </main>
  );
}
