"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Plus, Users, Trash2, LogOut } from "lucide-react";
import {
  useMyFamilies,
  createFamily,
  leaveFamily,
  deleteFamily,
  createInvite,
} from "@/app/lib/families";

export default function SettingsPage() {
  const session = useSession();
  const { families, loaded, refresh } = useMyFamilies();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  if (session.status === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-stone-400">
        …
      </main>
    );
  }
  if (session.status !== "authenticated") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <p className="text-sm text-stone-600">Sign in to manage families.</p>
        <Link href="/" className="text-sm font-medium text-stone-900 underline">
          Back home
        </Link>
      </main>
    );
  }

  async function onCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createFamily(newName.trim());
      setNewName("");
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function onInvite(familyId: string) {
    setInviteFor(familyId);
    setInviteCode(null);
    const r = await createInvite(familyId);
    if (r) setInviteCode(r.code);
  }

  async function onLeave(id: string, name: string) {
    if (!confirm(`Leave the family "${name}"?`)) return;
    const ok = await leaveFamily(id);
    if (!ok) alert("Couldn't leave — you may be the sole owner.");
    await refresh();
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete the family "${name}"? This removes shared recipes.`))
      return;
    await deleteFamily(id);
    await refresh();
  }

  function inviteUrl(code: string) {
    if (typeof window === "undefined") return code;
    return `${window.location.origin}/invite/${code}`;
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Settings
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Signed in as{" "}
            <span className="font-medium">{session.data?.user?.email}</span>.
          </p>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">
            Families
          </h2>
          <p className="mb-4 text-sm text-stone-600">
            A family is a shared recipe library. Anyone you invite can save to,
            cook from, and check off the mise of any recipe in that library.
          </p>

          {!loaded ? (
            <p className="text-sm text-stone-400">Loading…</p>
          ) : families.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-600">
              You aren&apos;t in any families yet. Create one below.
            </p>
          ) : (
            <ul className="space-y-2">
              {families.map((f) => (
                <li
                  key={f.id}
                  className="rounded-lg border border-stone-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-stone-900">
                        {f.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {f.memberCount} member{f.memberCount === 1 ? "" : "s"}
                        {" · "}
                        {f.recipeCount} recipe{f.recipeCount === 1 ? "" : "s"}
                        {" · you are "}
                        {f.role.toLowerCase()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(f.role === "OWNER" || f.role === "ADMIN") && (
                        <button
                          type="button"
                          onClick={() => onInvite(f.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Invite
                        </button>
                      )}
                      {f.role === "OWNER" ? (
                        <button
                          type="button"
                          onClick={() => onDelete(f.id, f.name)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onLeave(f.id, f.name)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Leave
                        </button>
                      )}
                    </div>
                  </div>

                  {inviteFor === f.id && (
                    <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                      {inviteCode ? (
                        <>
                          <div className="mb-1 text-xs font-medium uppercase tracking-wider">
                            Invite link (good for 14 days)
                          </div>
                          <input
                            readOnly
                            value={inviteUrl(inviteCode)}
                            onFocus={(e) => e.currentTarget.select()}
                            className="w-full rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs"
                          />
                          <p className="mt-1 text-xs text-emerald-800">
                            Send to anyone. They sign in with Google and join.
                          </p>
                        </>
                      ) : (
                        <p>Generating…</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">
            Create a family
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              placeholder="The Archers, Sunday club, …"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
              className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200 sm:text-sm"
            />
            <button
              type="button"
              onClick={onCreate}
              disabled={creating || !newName.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
