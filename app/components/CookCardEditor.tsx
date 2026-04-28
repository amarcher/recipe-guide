"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";
import type { CookCard, Ingredient, Step, StepIcon } from "@/app/types";
import { patchRecipe, resetRecipeOverride } from "@/app/lib/storage";

const STEP_ICONS: ReadonlyArray<{ value: StepIcon; label: string }> = [
  { value: "flame", label: "Flame (sear, sauté)" },
  { value: "soup", label: "Soup (simmer)" },
  { value: "boil", label: "Boil" },
  { value: "oven", label: "Oven (bake, roast, broil)" },
  { value: "knife", label: "Knife (chop, prep)" },
  { value: "wine", label: "Wine (deglaze, liquid)" },
  { value: "leaf", label: "Leaf (herbs, garnish)" },
  { value: "mix", label: "Mix (combine, whisk)" },
  { value: "salt", label: "Salt (season)" },
  { value: "rest", label: "Rest (chill, marinate)" },
  { value: "serve", label: "Serve" },
  { value: "blend", label: "Blend, purée" },
];

const SAVE_DEBOUNCE_MS = 500;

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

export function CookCardEditor({
  recipeId,
  initialCard,
  initialOverrideUpdatedAt,
  onExitEdit,
}: {
  recipeId: string;
  initialCard: CookCard;
  initialOverrideUpdatedAt: number | null;
  onExitEdit: () => void;
}) {
  const [draft, setDraft] = useState<CookCard>(initialCard);
  const [overrideUpdatedAt, setOverrideUpdatedAt] = useState<number | null>(
    initialOverrideUpdatedAt
  );
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const dirty = useRef(false);
  const inflight = useRef<Promise<void> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overrideUpdatedAtRef = useRef(overrideUpdatedAt);
  const draftRef = useRef(draft);
  useEffect(() => {
    overrideUpdatedAtRef.current = overrideUpdatedAt;
  }, [overrideUpdatedAt]);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setStatus({ kind: "saving" });
    inflight.current = (async () => {
      const res = await patchRecipe(
        recipeId,
        draftRef.current,
        overrideUpdatedAtRef.current
      );
      if (res.ok) {
        setOverrideUpdatedAt(res.overrideUpdatedAt);
        setStatus({ kind: "saved" });
        return;
      }
      if ("conflict" in res) {
        setStatus({ kind: "conflict" });
        return;
      }
      setStatus({ kind: "error", message: res.error });
    })();
    await inflight.current;
    inflight.current = null;
  }, [recipeId]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    setStatus((s) => (s.kind === "conflict" ? s : { kind: "saving" }));
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void flush();
    }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  const updateField = useCallback(
    <K extends keyof CookCard>(key: K, value: CookCard[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
      scheduleSave();
    },
    [scheduleSave]
  );

  const updateStep = useCallback(
    (index: number, patch: Partial<Step>) => {
      setDraft((prev) => {
        const steps = prev.steps.slice();
        steps[index] = { ...steps[index], ...patch };
        return { ...prev, steps };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const moveStep = useCallback(
    (index: number, direction: -1 | 1) => {
      setDraft((prev) => {
        const target = index + direction;
        if (target < 0 || target >= prev.steps.length) return prev;
        const steps = prev.steps.slice();
        [steps[index], steps[target]] = [steps[target], steps[index]];
        // Re-number to keep the `number` field aligned with array order.
        const renumbered = steps.map((s, i) => ({ ...s, number: i + 1 }));
        return { ...prev, steps: renumbered };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const deleteStep = useCallback(
    (index: number) => {
      setDraft((prev) => {
        const steps = prev.steps
          .filter((_, i) => i !== index)
          .map((s, i) => ({ ...s, number: i + 1 }));
        return { ...prev, steps };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const addStep = useCallback(() => {
    setDraft((prev) => {
      const next: Step = {
        number: prev.steps.length + 1,
        headline: "New step",
        action: "",
        icon: "mix",
        duration: null,
        temperature: null,
        doneness_cue: null,
        equipment: [],
        ingredients: [],
      };
      return { ...prev, steps: [...prev.steps, next] };
    });
    scheduleSave();
  }, [scheduleSave]);

  const updateStepIngredient = useCallback(
    (stepIndex: number, ingIndex: number, patch: Partial<Ingredient>) => {
      setDraft((prev) => {
        const steps = prev.steps.slice();
        const step = steps[stepIndex];
        const ingredients = step.ingredients.slice();
        ingredients[ingIndex] = { ...ingredients[ingIndex], ...patch };
        steps[stepIndex] = { ...step, ingredients };
        return { ...prev, steps };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const moveStepIngredient = useCallback(
    (stepIndex: number, ingIndex: number, direction: -1 | 1) => {
      setDraft((prev) => {
        const steps = prev.steps.slice();
        const step = steps[stepIndex];
        const target = ingIndex + direction;
        if (target < 0 || target >= step.ingredients.length) return prev;
        const ingredients = step.ingredients.slice();
        [ingredients[ingIndex], ingredients[target]] = [
          ingredients[target],
          ingredients[ingIndex],
        ];
        steps[stepIndex] = { ...step, ingredients };
        return { ...prev, steps };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const deleteStepIngredient = useCallback(
    (stepIndex: number, ingIndex: number) => {
      setDraft((prev) => {
        const steps = prev.steps.slice();
        const step = steps[stepIndex];
        steps[stepIndex] = {
          ...step,
          ingredients: step.ingredients.filter((_, i) => i !== ingIndex),
        };
        return { ...prev, steps };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const addStepIngredient = useCallback(
    (stepIndex: number) => {
      setDraft((prev) => {
        const steps = prev.steps.slice();
        const step = steps[stepIndex];
        steps[stepIndex] = {
          ...step,
          ingredients: [
            ...step.ingredients,
            { item: "", quantity: null, unit: null, prep: null, note: null },
          ],
        };
        return { ...prev, steps };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const updatePantryIngredient = useCallback(
    (index: number, patch: Partial<Ingredient>) => {
      setDraft((prev) => {
        const next = prev.pantry_ingredients.slice();
        next[index] = { ...next[index], ...patch };
        return { ...prev, pantry_ingredients: next };
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const deletePantryIngredient = useCallback(
    (index: number) => {
      setDraft((prev) => ({
        ...prev,
        pantry_ingredients: prev.pantry_ingredients.filter((_, i) => i !== index),
      }));
      scheduleSave();
    },
    [scheduleSave]
  );

  const addPantryIngredient = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      pantry_ingredients: [
        ...prev.pantry_ingredients,
        { item: "", quantity: null, unit: null, prep: null, note: null },
      ],
    }));
    scheduleSave();
  }, [scheduleSave]);

  const updateEquipment = useCallback(
    (next: string[]) => {
      setDraft((prev) => ({ ...prev, equipment: next }));
      scheduleSave();
    },
    [scheduleSave]
  );

  const onReset = useCallback(async () => {
    if (
      !window.confirm(
        "Reset this recipe to the original parsed version? Your edits to this scope will be lost."
      )
    ) {
      return;
    }
    const ok = await resetRecipeOverride(recipeId);
    if (ok) {
      onExitEdit();
    } else {
      setStatus({ kind: "error", message: "couldn’t reset" });
    }
  }, [recipeId, onExitEdit]);

  const onDoneEditing = useCallback(async () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (dirty.current) await flush();
    if (inflight.current) await inflight.current;
    onExitEdit();
  }, [flush, onExitEdit]);

  // Flush on tab/window close so edits don't get stranded.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (dirty.current) {
        // Best-effort; the browser may not wait for the fetch to complete.
        void flush();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [flush]);

  return (
    <article className="mx-auto w-full max-w-3xl space-y-4">
      <EditorHeader
        status={status}
        onReset={onReset}
        onDone={onDoneEditing}
      />

      <header className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="text-[11px] uppercase tracking-wider text-stone-400">
          {hostnameOf(draft.source_url)}
        </div>
        <input
          aria-label="Title"
          className="mt-1 block w-full border-b border-transparent bg-transparent text-3xl font-semibold tracking-tight text-stone-900 focus:border-stone-300 focus:outline-none"
          value={draft.title}
          onChange={(e) => updateField("title", e.target.value)}
        />
        <textarea
          aria-label="Tagline"
          className="mt-2 block w-full resize-none border-b border-transparent bg-transparent text-sm italic text-stone-600 focus:border-stone-300 focus:outline-none"
          value={draft.tagline ?? ""}
          rows={1}
          placeholder="Add a tagline (Alison Roman voice, ≤12 words)"
          onChange={(e) => updateField("tagline", e.target.value || null)}
        />

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LabeledTextInput
            label="Servings"
            value={draft.servings ?? ""}
            onChange={(v) => updateField("servings", v || null)}
            placeholder="e.g. 4 to 6"
          />
          <LabeledTextInput
            label="Total time"
            value={draft.total_time ?? ""}
            onChange={(v) => updateField("total_time", v || null)}
            placeholder="e.g. 1 hr 30 min"
          />
          <LabeledTextInput
            label="Active time"
            value={draft.active_time ?? ""}
            onChange={(v) => updateField("active_time", v || null)}
            placeholder="e.g. 45 min"
          />
        </div>

        <EquipmentChipsEditor value={draft.equipment} onChange={updateEquipment} />
      </header>

      <Section title="Pantry / extras">
        <p className="mb-2 text-xs text-stone-500">
          Items that span steps or don’t fit cleanly in one — salt, oil, garnish.
          Per-step ingredients live with the step they’re used in.
        </p>
        <IngredientList
          rows={draft.pantry_ingredients}
          onUpdate={updatePantryIngredient}
          onDelete={deletePantryIngredient}
          onAdd={addPantryIngredient}
        />
      </Section>

      <Section title="Steps">
        <div className="space-y-3">
          {draft.steps.map((step, i) => (
            <StepEditor
              key={i}
              step={step}
              index={i}
              total={draft.steps.length}
              onUpdate={(patch) => updateStep(i, patch)}
              onMove={(dir) => moveStep(i, dir)}
              onDelete={() => deleteStep(i)}
              onUpdateIngredient={(idx, patch) => updateStepIngredient(i, idx, patch)}
              onMoveIngredient={(idx, dir) => moveStepIngredient(i, idx, dir)}
              onDeleteIngredient={(idx) => deleteStepIngredient(i, idx)}
              onAddIngredient={() => addStepIngredient(i)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addStep}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
        >
          <Plus className="h-4 w-4" />
          Add step
        </button>
      </Section>
    </article>
  );
}

function EditorHeader({
  status,
  onReset,
  onDone,
}: {
  status: SaveStatus;
  onReset: () => void;
  onDone: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
      <div className="flex items-center gap-2 text-sm">
        <SaveStatusBadge status={status} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to original
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
        >
          <Check className="h-3.5 w-3.5" />
          Done editing
        </button>
      </div>
    </div>
  );
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  switch (status.kind) {
    case "saving":
      return (
        <span className="inline-flex items-center gap-1.5 text-stone-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saving…
        </span>
      );
    case "saved":
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          Saved
        </span>
      );
    case "conflict":
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          Someone else just edited this — reload to merge
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 text-rose-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          {status.message}
        </span>
      );
    default:
      return <span className="text-stone-400">Editing</span>;
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function LabeledTextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </span>
      <input
        type="text"
        className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-800 focus:border-stone-500 focus:outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function EquipmentChipsEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const onAdd = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="mt-4 border-t border-stone-100 pt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        Equipment
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {value.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-700"
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              onClick={() =>
                onChange(value.filter((_, idx) => idx !== i))
              }
              className="ml-0.5 text-stone-400 hover:text-stone-700"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 focus:border-stone-500 focus:outline-none"
          placeholder="Add equipment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          onBlur={onAdd}
        />
      </div>
    </div>
  );
}

function IngredientList({
  rows,
  onUpdate,
  onDelete,
  onAdd,
  onMove,
}: {
  rows: Ingredient[];
  onUpdate: (index: number, patch: Partial<Ingredient>) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  onMove?: (index: number, dir: -1 | 1) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((ing, i) => (
        <IngredientRow
          key={i}
          ing={ing}
          onUpdate={(patch) => onUpdate(i, patch)}
          onDelete={() => onDelete(i)}
          onMoveUp={onMove && i > 0 ? () => onMove(i, -1) : undefined}
          onMoveDown={
            onMove && i < rows.length - 1 ? () => onMove(i, 1) : undefined
          }
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Add ingredient
      </button>
    </div>
  );
}

function IngredientRow({
  ing,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  ing: Ingredient;
  onUpdate: (patch: Partial<Ingredient>) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="grid grid-cols-12 items-center gap-1.5">
      <input
        type="text"
        aria-label="Quantity"
        className="col-span-2 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 tabular-nums focus:border-stone-500 focus:outline-none"
        placeholder="qty"
        value={ing.quantity ?? ""}
        onChange={(e) => onUpdate({ quantity: e.target.value || null })}
      />
      <input
        type="text"
        aria-label="Unit"
        className="col-span-2 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 focus:border-stone-500 focus:outline-none"
        placeholder="unit"
        value={ing.unit ?? ""}
        onChange={(e) => onUpdate({ unit: e.target.value || null })}
      />
      <input
        type="text"
        aria-label="Item"
        className="col-span-4 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 focus:border-stone-500 focus:outline-none"
        placeholder="item"
        value={ing.item}
        onChange={(e) => onUpdate({ item: e.target.value })}
      />
      <input
        type="text"
        aria-label="Prep"
        className="col-span-2 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 focus:border-stone-500 focus:outline-none"
        placeholder="prep"
        value={ing.prep ?? ""}
        onChange={(e) => onUpdate({ prep: e.target.value || null })}
      />
      <input
        type="text"
        aria-label="Note"
        className="col-span-2 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 focus:border-stone-500 focus:outline-none"
        placeholder="note"
        value={ing.note ?? ""}
        onChange={(e) => onUpdate({ note: e.target.value || null })}
      />
      <div className="col-span-12 -mt-0.5 flex items-center justify-end gap-0.5 text-stone-400">
        {onMoveUp && (
          <button
            type="button"
            aria-label="Move up"
            onClick={onMoveUp}
            className="rounded p-0.5 hover:bg-stone-100 hover:text-stone-700"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        )}
        {onMoveDown && (
          <button
            type="button"
            aria-label="Move down"
            onClick={onMoveDown}
            className="rounded p-0.5 hover:bg-stone-100 hover:text-stone-700"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          aria-label="Delete"
          onClick={onDelete}
          className="rounded p-0.5 hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function StepEditor({
  step,
  index,
  total,
  onUpdate,
  onMove,
  onDelete,
  onUpdateIngredient,
  onMoveIngredient,
  onDeleteIngredient,
  onAddIngredient,
}: {
  step: Step;
  index: number;
  total: number;
  onUpdate: (patch: Partial<Step>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onUpdateIngredient: (idx: number, patch: Partial<Ingredient>) => void;
  onMoveIngredient: (idx: number, dir: -1 | 1) => void;
  onDeleteIngredient: (idx: number) => void;
  onAddIngredient: () => void;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-stone-400">
          Step {index + 1}
        </div>
        <div className="flex items-center gap-0.5 text-stone-400">
          <button
            type="button"
            aria-label="Move step up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="rounded p-1 hover:bg-stone-100 hover:text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Move step down"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            className="rounded p-1 hover:bg-stone-100 hover:text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Delete step"
            onClick={onDelete}
            className="rounded p-1 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <input
        aria-label="Step headline"
        className="mt-2 block w-full border-b border-transparent bg-transparent text-lg font-semibold tracking-tight text-stone-900 focus:border-stone-300 focus:outline-none"
        value={step.headline}
        onChange={(e) => onUpdate({ headline: e.target.value })}
      />

      <textarea
        aria-label="Step action"
        className="mt-2 block w-full resize-none rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm leading-relaxed text-stone-800 focus:border-stone-400 focus:outline-none"
        value={step.action}
        rows={3}
        onChange={(e) => onUpdate({ action: e.target.value })}
      />

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Icon
          </span>
          <select
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-800 focus:border-stone-500 focus:outline-none"
            value={step.icon}
            onChange={(e) => onUpdate({ icon: e.target.value as StepIcon })}
          >
            {STEP_ICONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <LabeledTextInput
          label="Duration"
          value={step.duration ?? ""}
          onChange={(v) => onUpdate({ duration: v || null })}
          placeholder="e.g. 8-10 min"
        />
        <LabeledTextInput
          label="Temperature"
          value={step.temperature ?? ""}
          onChange={(v) => onUpdate({ temperature: v || null })}
          placeholder="e.g. 375°F"
        />
        <LabeledTextInput
          label="Doneness cue"
          value={step.doneness_cue ?? ""}
          onChange={(v) => onUpdate({ doneness_cue: v || null })}
          placeholder="e.g. golden brown"
        />
      </div>

      <div className="mt-4 border-t border-stone-100 pt-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Ingredients used in this step
        </div>
        <IngredientList
          rows={step.ingredients}
          onUpdate={onUpdateIngredient}
          onDelete={onDeleteIngredient}
          onAdd={onAddIngredient}
          onMove={onMoveIngredient}
        />
      </div>
    </div>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
