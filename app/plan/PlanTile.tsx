"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/app/components/ConfirmDialog";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  INTAKE_COMPLETE: "Intake complete",
  SKELETON_READY: "Skeleton ready",
  CANDIDATES_READY: "Ready to pick meals",
  COMMITTED: "Meals committed",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export type PlanTileData = {
  id: string;
  weekOfMs: number;
  status: string;
  family: { id: string; name: string } | null;
  candidateCount: number;
  mealCount: number;
};

export function PlanTile({ plan }: { plan: PlanTileData }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      title: "Delete this plan?",
      message:
        "All candidates, committed meals, and the grocery list go with it. This can't be undone.",
      confirmLabel: "Delete plan",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        alert(body.error ?? "Could not delete the plan.");
        return;
      }
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="group relative">
      <Link
        href={`/plan/${plan.id}`}
        className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-300"
      >
        <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-stone-400">
          <span>
            Week of{" "}
            {new Date(plan.weekOfMs).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
          {plan.family ? (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">
              {plan.family.name}
            </span>
          ) : (
            <span className="rounded-full bg-stone-50 px-2 py-0.5 text-stone-500">
              Personal
            </span>
          )}
        </div>
        <h2 className="mt-2 text-base font-semibold text-stone-900">
          {STATUS_LABEL[plan.status] ?? plan.status}
        </h2>
        <div className="mt-2 flex gap-4 text-xs text-stone-500">
          <span>{plan.candidateCount} candidates</span>
          <span>{plan.mealCount} committed</span>
        </div>
      </Link>

      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="Delete plan"
        className="absolute right-2 bottom-2 rounded-full p-1.5 text-stone-400 opacity-0 transition hover:bg-stone-100 hover:text-rose-600 group-hover:opacity-100 disabled:opacity-60"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
