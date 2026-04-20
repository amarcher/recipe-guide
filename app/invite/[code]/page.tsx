"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Users } from "lucide-react";

type Status =
  | { kind: "loading" }
  | { kind: "preview"; familyName: string }
  | { kind: "accepting" }
  | { kind: "joined"; familyId: string }
  | { kind: "error"; message: string };

export default function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const session = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/invites/${code}`);
      if (cancelled) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatus({ kind: "error", message: err?.error ?? `error ${res.status}` });
        return;
      }
      const data = (await res.json()) as { family: { name: string } };
      setStatus({ kind: "preview", familyName: data.family.name });
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function accept() {
    setStatus({ kind: "accepting" });
    const res = await fetch(`/api/invites/${code}`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus({ kind: "error", message: err?.error ?? `error ${res.status}` });
      return;
    }
    const data = (await res.json()) as { familyId: string };
    setStatus({ kind: "joined", familyId: data.familyId });
    setTimeout(() => router.push("/library"), 800);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-stone-500">
          <Users className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Family invite
          </span>
        </div>

        {status.kind === "loading" && (
          <p className="text-sm text-stone-500">Looking up invite…</p>
        )}

        {status.kind === "error" && (
          <p className="text-sm text-rose-700">
            That invite is no longer valid: {status.message}
          </p>
        )}

        {status.kind === "preview" && (
          <>
            <h1 className="text-xl font-semibold text-stone-900">
              Join “{status.familyName}”?
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              You’ll share a recipe library with everyone in this family.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {session.status === "authenticated" ? (
                <button
                  type="button"
                  onClick={accept}
                  className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
                >
                  Accept invite
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    signIn("google", { redirectTo: `/invite/${code}` })
                  }
                  className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
                >
                  Sign in with Google to join
                </button>
              )}
            </div>
          </>
        )}

        {status.kind === "accepting" && (
          <p className="text-sm text-stone-500">Joining…</p>
        )}

        {status.kind === "joined" && (
          <p className="text-sm text-emerald-700">
            You’re in. Redirecting to your library…
          </p>
        )}
      </div>
    </main>
  );
}
