"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { forkRecipe } from "@/app/lib/storage";

// Roadmap item 2.20 — sign-in / save-a-copy CTA on /r/[token].
// Two states:
//   - signed out: prompt to sign in (sends them through the normal auth
//     flow; they land back here, then can fork).
//   - signed in:  "save a copy" button forks into the viewer's personal
//     library and redirects to /recipe/[id].

export function GuestForkBanner({
  savedRecipeId,
}: {
  savedRecipeId: string;
}) {
  const router = useRouter();
  const session = useSession();
  const signedIn = session.status === "authenticated";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fork() {
    setPending(true);
    setError(null);
    const r = await forkRecipe(savedRecipeId);
    if ("error" in r) {
      setError(r.error);
      setPending(false);
      return;
    }
    router.push(`/recipe/${r.id}`);
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-snug text-amber-900">
          <span className="font-semibold">Shared with you.</span> Read-only —
          {signedIn
            ? " save a copy to cook it or tweak it."
            : " sign in to save a copy and cook it."}
        </div>
        {signedIn ? (
          <button
            type="button"
            onClick={fork}
            disabled={pending}
            className="inline-flex items-center gap-2 self-start rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-950 disabled:opacity-60 sm:self-auto"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save a copy
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              signIn("google", {
                callbackUrl:
                  typeof window !== "undefined"
                    ? window.location.pathname
                    : "/",
              })
            }
            className="inline-flex items-center gap-2 self-start rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-950 sm:self-auto"
          >
            Sign in to save
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-amber-900">Couldn’t fork: {error}</p>
      )}
    </div>
  );
}
