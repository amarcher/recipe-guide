"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Sprite } from "@/app/components/Sprite";
import { useConfirm } from "@/app/components/ConfirmDialog";
import { discoverSprites } from "@/app/lib/sprites";
import { aisleForName, spriteAisle } from "@/app/lib/sprites-core";
import { AISLES, AISLE_LABEL, type Aisle } from "@/app/lib/taxonomy";
import { vibrate } from "@/app/lib/alarm";
import {
  classifyFreshness,
  compareByUrgency,
  freshnessLabel,
  isNearExpiry,
} from "@/app/lib/pantry/freshness";
import type { PantryItemDTO } from "@/app/lib/pantry/serialize";

type FamilyChip = { id: string; name: string };

const USE_BY_CHOICES = [
  { value: "none", label: "No use-by" },
  { value: "0", label: "Use today" },
  { value: "1", label: "Tomorrow" },
  { value: "3", label: "In 3 days" },
  { value: "7", label: "In a week" },
  { value: "custom", label: "Pick a date…" },
] as const;

function offsetToMs(days: number): number {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function dateInputToMs(value: string): number | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime();
}

function msToDateInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function relativeAdded(ms: number): string {
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) /
      86_400_000,
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7)
    return new Date(ms).toLocaleDateString(undefined, { weekday: "short" });
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function aisleFor(item: PantryItemDTO): Aisle | "uncategorized" {
  return (
    (item.slug ? spriteAisle(item.slug) : null) ??
    aisleForName(item.display) ??
    "uncategorized"
  );
}

function quantityText(item: PantryItemDTO): string | null {
  const parts = [item.quantity, item.unit].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function FreshnessPill({
  mustUseBy,
  now,
}: {
  mustUseBy: number | null;
  now: number;
}) {
  if (mustUseBy == null) return null;
  const f = classifyFreshness(mustUseBy, now);
  const label = freshnessLabel(mustUseBy, now);
  const cls =
    f === "expired"
      ? "bg-rose-100 text-rose-800 ring-rose-200"
      : f === "today"
        ? "bg-amber-200/80 text-amber-950 ring-amber-300"
        : f === "soon"
          ? "bg-amber-100 text-amber-900 ring-amber-200"
          : "bg-stone-100 text-stone-600 ring-stone-200";
  return (
    <span
      suppressHydrationWarning
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}
    >
      {label}
    </span>
  );
}

export function PantryView({
  families,
  initialFamilyId,
  initialItems,
}: {
  families: FamilyChip[];
  initialFamilyId: string;
  initialItems: PantryItemDTO[];
}) {
  const confirm = useConfirm();
  const [now] = useState(() => Date.now());
  const [familyId, setFamilyId] = useState(initialFamilyId);
  const [items, setItems] = useState(initialItems);
  const [switching, setSwitching] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [useBy, setUseBy] = useState<(typeof USE_BY_CHOICES)[number]["value"]>("none");
  const [customDate, setCustomDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [lastAdd, setLastAdd] = useState<string | null>(null);

  useEffect(() => {
    const names = items.map((it) => it.display);
    if (names.length) void discoverSprites(names);
  }, [items]);

  const useSoon = useMemo(
    () =>
      items
        .filter((it) => isNearExpiry(it.mustUseBy, now))
        .sort(compareByUrgency),
    [items, now],
  );

  const groups = useMemo(() => {
    const buckets = new Map<string, PantryItemDTO[]>();
    for (const it of items) {
      const k = aisleFor(it);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(it);
    }
    const order: Array<Aisle | "uncategorized"> = [...AISLES, "uncategorized"];
    return order
      .filter((k) => buckets.has(k))
      .map((k) => ({
        key: k,
        label: k === "uncategorized" ? "Other" : AISLE_LABEL[k as Aisle],
        items: buckets.get(k)!.sort(compareByUrgency),
      }));
  }, [items]);

  async function switchFamily(id: string) {
    if (id === familyId || switching) return;
    setSwitching(true);
    setError(null);
    try {
      const r = await fetch(`/api/pantry?familyId=${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error("Couldn't load that pantry.");
      const data = (await r.json()) as { items: PantryItemDTO[] };
      setFamilyId(id);
      setItems(data.items);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that pantry.");
    } finally {
      setSwitching(false);
    }
  }

  function pendingMustUseBy(): number | null {
    if (useBy === "none") return null;
    if (useBy === "custom") return customDate ? dateInputToMs(customDate) : null;
    return offsetToMs(Number(useBy));
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const display = name.trim();
    if (!display || adding) return;
    setAdding(true);
    setError(null);
    try {
      const r = await fetch("/api/pantry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          familyId,
          display,
          quantity: qty.trim() || undefined,
          mustUseBy: pendingMustUseBy(),
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't add that.");
      }
      const { item, merged } = (await r.json()) as {
        item: PantryItemDTO;
        merged: boolean;
      };
      setItems((prev) =>
        merged && prev.some((it) => it.id === item.id)
          ? prev.map((it) => (it.id === item.id ? item : it))
          : [item, ...prev.filter((it) => it.id !== item.id)],
      );
      setLastAdd(
        merged ? `Topped up ${item.display.toLowerCase()}` : null,
      );
      setName("");
      setQty("");
      setUseBy("none");
      setCustomDate("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that.");
    } finally {
      setAdding(false);
    }
  }

  async function removeItem(item: PantryItemDTO) {
    vibrate(15);
    setError(null);
    const prev = items;
    setItems((cur) => cur.filter((it) => it.id !== item.id));
    setEditingId(null);
    try {
      const r = await fetch(`/api/pantry/${item.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    } catch {
      setItems(prev);
      setError(`Couldn't remove ${item.display.toLowerCase()} — try again.`);
    }
  }

  async function saveEdit(
    id: string,
    patch: { display: string; quantity: string; mustUseBy: number | null },
  ) {
    setError(null);
    const r = await fetch(`/api/pantry/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        display: patch.display,
        quantity: patch.quantity.trim() || null,
        mustUseBy: patch.mustUseBy,
      }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save changes.");
      return;
    }
    const { item } = (await r.json()) as { item: PantryItemDTO };
    setItems((cur) => cur.map((it) => (it.id === item.id ? item : it)));
    setEditingId(null);
  }

  async function clearAll() {
    const familyName = families.find((f) => f.id === familyId)?.name ?? "this family";
    const ok = await confirm({
      title: "Clear the pantry?",
      message: `Every on-hand item for ${familyName} will be removed. Recipes will stop pre-checking these ingredients.`,
      confirmLabel: "Clear pantry",
      tone: "danger",
    });
    if (!ok) return;
    const prev = items;
    setItems([]);
    try {
      const r = await fetch(
        `/api/pantry?familyId=${encodeURIComponent(familyId)}`,
        { method: "DELETE" },
      );
      if (!r.ok) throw new Error();
    } catch {
      setItems(prev);
      setError("Couldn't clear the pantry — try again.");
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-stone-900">
            Pantry
          </h1>
          <p className="mt-1 max-w-md text-sm text-stone-600">
            What&apos;s on hand at home. Pantry items pre-check your mise en
            place and drop off grocery lists; items checked off a family
            grocery list land here on their own.
          </p>
        </div>
        {families.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {families.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => switchFamily(f.id)}
                aria-pressed={f.id === familyId}
                className={`rounded-full px-3 py-1 text-[12px] font-medium ring-1 transition ${
                  f.id === familyId
                    ? "bg-stone-900 text-stone-50 ring-stone-900"
                    : "bg-white text-stone-600 ring-stone-200 hover:ring-stone-400"
                }`}
              >
                {f.name}
              </button>
            ))}
            {switching && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-stone-400" />
            )}
          </div>
        )}
      </div>

      <p
        suppressHydrationWarning
        className="mt-3 text-[11px] text-stone-500 tabular-nums"
      >
        {items.length} item{items.length === 1 ? "" : "s"} on hand
        {useSoon.length > 0 && ` · ${useSoon.length} to use soon`}
      </p>

      {useSoon.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-amber-900">
            Use these soon
          </h2>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {useSoon.map((it) => (
              <li
                key={it.id}
                className="flex items-center gap-2 rounded-full border border-amber-200 bg-white py-1 pl-1.5 pr-1 shadow-sm"
              >
                <Sprite name={it.display} size={26} />
                <span className="text-[13px] font-medium text-stone-900">
                  {it.display}
                </span>
                <FreshnessPill mustUseBy={it.mustUseBy} now={now} />
                <button
                  type="button"
                  onClick={() => removeItem(it)}
                  title="Used it up — remove from pantry"
                  aria-label={`Used up ${it.display} — remove from pantry`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-stone-400 transition hover:bg-emerald-100 hover:text-emerald-800"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={addItem}
        className="mt-4 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setLastAdd(null);
            }}
            placeholder="Add something on hand — cilantro, leftover rice…"
            aria-label="Item name"
            className="min-w-0 flex-1 basis-48 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
          />
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="How much?"
            aria-label="Quantity"
            className="w-28 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
          />
          <select
            value={useBy}
            onChange={(e) =>
              setUseBy(e.target.value as (typeof USE_BY_CHOICES)[number]["value"])
            }
            aria-label="Use by"
            className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm text-stone-700 focus:border-stone-400 focus:outline-none"
          >
            {USE_BY_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {useBy === "custom" && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              aria-label="Use-by date"
              className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-sm text-stone-700 focus:border-stone-400 focus:outline-none"
            />
          )}
          <button
            type="submit"
            disabled={!name.trim() || adding}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {adding ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add
          </button>
        </div>
        {lastAdd && (
          <p className="mt-2 text-[11px] text-emerald-700">
            {lastAdd} — it was already on hand, so we updated it instead of
            adding a duplicate.
          </p>
        )}
      </form>

      {error && <p className="mt-3 text-[12px] text-rose-700">{error}</p>}

      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center">
          <p className="font-serif text-lg italic text-stone-700">
            Nothing on hand yet.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-500">
            Add what&apos;s in the fridge above, or check items off a{" "}
            <Link href="/plan" className="underline underline-offset-2">
              plan&apos;s grocery list
            </Link>{" "}
            — purchased items land here automatically and recipes will
            pre-check them in the mise.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <div key={g.key}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                {g.label}
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {g.items.map((it) =>
                  editingId === it.id ? (
                    <EditTile
                      key={it.id}
                      item={it}
                      onCancel={() => setEditingId(null)}
                      onSave={saveEdit}
                      onRemove={() => removeItem(it)}
                    />
                  ) : (
                    <PantryTile
                      key={it.id}
                      item={it}
                      now={now}
                      onEdit={() => setEditingId(it.id)}
                      onUsedUp={() => removeItem(it)}
                    />
                  ),
                )}
              </ul>
            </div>
          ))}

          <div className="flex justify-end border-t border-stone-200 pt-4">
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-stone-500 transition hover:bg-rose-50 hover:text-rose-800"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear pantry
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PantryTile({
  item,
  now,
  onEdit,
  onUsedUp,
}: {
  item: PantryItemDTO;
  now: number;
  onEdit: () => void;
  onUsedUp: () => void;
}) {
  const qty = quantityText(item);
  return (
    <li className="group flex items-center gap-3 rounded-xl border border-stone-100 bg-white p-2.5 shadow-sm transition hover:border-stone-300">
      <Sprite name={item.display} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium leading-snug text-stone-900">
            {item.display}
          </span>
          <FreshnessPill mustUseBy={item.mustUseBy} now={now} />
        </div>
        <p
          suppressHydrationWarning
          className="mt-0.5 truncate text-[11px] text-stone-500"
        >
          {qty && <span className="tabular-nums">{qty} · </span>}
          {item.source === "grocery" ? "from groceries" : "added"}{" "}
          {relativeAdded(item.addedAt)}
          {item.addedByName ? ` · ${item.addedByName.split(" ")[0]}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onEdit}
          title={`Edit ${item.display}`}
          aria-label={`Edit ${item.display}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-800"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onUsedUp}
          title={`Used up ${item.display} — remove from pantry`}
          aria-label={`Used up ${item.display} — remove from pantry`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition hover:bg-emerald-50 hover:text-emerald-800"
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </li>
  );
}

function EditTile({
  item,
  onCancel,
  onSave,
  onRemove,
}: {
  item: PantryItemDTO;
  onCancel: () => void;
  onSave: (
    id: string,
    patch: { display: string; quantity: string; mustUseBy: number | null },
  ) => Promise<void>;
  onRemove: () => void;
}) {
  const [display, setDisplay] = useState(item.display);
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [date, setDate] = useState(
    item.mustUseBy != null ? msToDateInput(item.mustUseBy) : "",
  );
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!display.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(item.id, {
        display: display.trim(),
        quantity,
        mustUseBy: date ? dateInputToMs(date) : null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-xl border border-stone-300 bg-white p-3 shadow-sm sm:col-span-2">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <Sprite name={display} size={36} />
        <input
          value={display}
          onChange={(e) => setDisplay(e.target.value)}
          aria-label="Item name"
          autoFocus
          className="min-w-0 flex-1 basis-40 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm focus:border-stone-400 focus:outline-none"
        />
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="How much?"
          aria-label="Quantity"
          className="w-28 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm focus:border-stone-400 focus:outline-none"
        />
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Use-by date"
            className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-sm text-stone-700 focus:border-stone-400 focus:outline-none"
          />
          {date && (
            <button
              type="button"
              onClick={() => setDate("")}
              title="Clear use-by date"
              aria-label="Clear use-by date"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-stone-500 hover:bg-rose-50 hover:text-rose-800"
          >
            Remove
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[12px] font-medium text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!display.trim() || saving}
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </li>
  );
}
