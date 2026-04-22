"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";

export function NewPlanButton({
  variant = "primary",
}: {
  variant?: "primary" | "compact";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const r = await fetch("/api/plans", { method: "POST" });
      if (!r.ok) throw new Error("failed");
      const { id } = (await r.json()) as { id: string };
      router.push(`/plan/${id}/intake`);
    } catch {
      setBusy(false);
    }
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
      >
        {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-4 w-4" />}
        New plan
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
    >
      {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {busy ? "Starting…" : "Start a new plan"}
    </button>
  );
}
