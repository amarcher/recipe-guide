"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, ImagePlus, Loader2, Trash2, Users } from "lucide-react";
import type { CookCard } from "@/app/types";
import { deleteRecipe } from "@/app/lib/storage";
import { useConfirm } from "@/app/components/ConfirmDialog";
import {
  MealFace,
  resolveMealFaceKind,
  type MealFaceSubject,
} from "@/app/components/MealFace";

// Re-exports for backwards compatibility — call sites that imported from
// here can keep doing so. New code should import from @/app/components/MealFace.
export type { WashKey } from "@/app/components/MealFace";
export { WASH, pickWash } from "@/app/components/MealFace";

export type TileData = {
  id: string;
  title: string;
  tagline: string | null;
  sourceUrl: string;
  photoUrl: string | null;
  videoUrl: string | null;
  videoAspectRatio: number | null;
  heroes: string[];
  totalCookCount: number;
  latestLastCookedAt: number | null;
  savedAt: number;
  scopes: Array<{ id: string; name: string } | null>;
  fromInstagram: boolean;
};

function formatRelative(ts: number, now: number): string {
  const diff = now - ts;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  const days = Math.floor(diff / day);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString();
}

export function heroesFromCard(card: CookCard, limit = 3): string[] {
  const skip = /^(salt|pepper|olive oil|oil|water|kosher salt|black pepper|salt and pepper|ice|ice water)$/i;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const step of card.steps) {
    for (const ing of step.ingredients) {
      const key = ing.item.trim().toLowerCase();
      if (!key || seen.has(key) || skip.test(ing.item)) continue;
      seen.add(key);
      out.push(ing.item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function RolodexTile({
  tile,
  tall,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  tile: TileData;
  tall: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const shownPhoto = localUrl ?? tile.photoUrl;
  const visualHeight = tall ? 220 : 160;

  // Subject for the shared visual primitive. Photo override comes from
  // pending uploads; vignette/swatch fall through automatically when there's
  // no photo or video.
  const subject: MealFaceSubject = {
    id: tile.id,
    title: tile.title,
    tagline: tile.tagline,
    photoUrl: shownPhoto,
    videoUrl: !localUrl ? tile.videoUrl : null,
    heroIngredientSlugs: tile.heroes,
  };
  const kind = resolveMealFaceKind(subject);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      setUploadError("not an image");
      return;
    }
    setUploadError(null);
    setUploading(true);
    const preview = URL.createObjectURL(file);
    setLocalUrl(preview);
    try {
      const form = new FormData();
      form.append("photo", file);
      const r = await fetch(`/api/recipes/${tile.id}/photo`, {
        method: "POST",
        body: form,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? r.statusText);
      }
      const body = (await r.json()) as { photoUrl: string };
      setLocalUrl(body.photoUrl);
      router.refresh();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "upload failed");
      setLocalUrl(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(preview);
    }
  }

  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragOver(true);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void upload(f);
  }

  function onPickPhoto(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    fileInput.current?.click();
  }

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      title: "Remove from library?",
      message: (
        <>
          <span className="font-medium text-stone-900">
            &ldquo;{tile.title}&rdquo;
          </span>{" "}
          will disappear from every scope you&rsquo;ve saved it to. Cook logs
          and photos go with it.
        </>
      ),
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    void deleteRecipe(tile.id);
  }

  let host = "";
  try {
    host = new URL(tile.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }

  // Snap once per mount — a library card doesn't need real-time "today" drift.
  const [nowAtMount] = useState(() => Date.now());
  const cookChip =
    tile.totalCookCount === 0
      ? { label: "never cooked", tone: "paper" as const }
      : tile.latestLastCookedAt &&
        nowAtMount - tile.latestLastCookedAt < 48 * 60 * 60 * 1000
      ? {
          label: `✓ cooked ${formatRelative(tile.latestLastCookedAt, nowAtMount)}`,
          tone: "dark" as const,
        }
      : null;

  function onSelectClick(e: React.MouseEvent) {
    if (!selectable) return;
    e.preventDefault();
    e.stopPropagation();
    onToggleSelect?.(tile.id);
  }

  const articleClass = `group relative mb-3 break-inside-avoid overflow-hidden rounded-2xl border bg-stone-50 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
    selected
      ? "border-stone-900 ring-2 ring-stone-900"
      : "border-stone-300 hover:border-stone-400"
  }`;

  const tileHref = selectable ? "#" : `/recipe/${tile.id}`;

  return (
    <article
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={articleClass}
      style={{ transitionDuration: "180ms" }}
    >
      <Link href={tileHref} onClick={onSelectClick} className="block">
        <div className="relative">
          {/* MealFace visual + caption — shared with menu/tonight/hosted-menu */}
          <MealFace
            subject={subject}
            visualHeight={visualHeight}
            showCaption={false}
            className="rounded-none"
          />

          {/* Library-specific overlay chrome */}
          {(dragOver || uploading) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <span className="text-xs font-medium">Drop to upload</span>
              )}
            </div>
          )}

          {selectable && (
            <span
              aria-hidden
              className={`absolute left-3 bottom-3 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                selected
                  ? "border-stone-900 bg-stone-900 text-stone-50"
                  : "border-stone-50/85 bg-stone-50/60 text-transparent backdrop-blur"
              }`}
            >
              ✓
            </span>
          )}

          {cookChip && (
            <span
              className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                cookChip.tone === "dark"
                  ? "bg-stone-900/85 text-stone-50 backdrop-blur"
                  : "bg-stone-50/85 text-stone-700 backdrop-blur"
              }`}
            >
              {cookChip.label}
            </span>
          )}

          {!selectable && (
            <button
              type="button"
              onClick={onPickPhoto}
              className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-stone-50/90 px-2 py-1 text-[11px] font-medium text-stone-800 shadow-sm backdrop-blur transition hover:bg-stone-50"
              aria-label={shownPhoto ? "Change photo" : "Add photo"}
            >
              <ImagePlus className="h-3 w-3" />
              {shownPhoto ? "Change" : "Add photo"}
            </button>
          )}

          {uploadError && (
            <div className="absolute bottom-2 left-2 right-2 rounded bg-rose-900/80 px-2 py-1 text-[11px] text-stone-50">
              {uploadError}
            </div>
          )}
        </div>

        {/* Library-specific caption — title + scope chips + cook count.
            Different from MealFace's default caption, so we render it ourselves. */}
        <div className="flex flex-col gap-2 bg-stone-50 px-4 py-3">
          <h2 className="font-serif text-[18px] font-medium leading-tight tracking-tight text-stone-900 line-clamp-2">
            {tile.title}
          </h2>

          {tile.tagline && kind !== "swatch" && (
            <p className="font-serif italic text-[13px] leading-snug text-stone-600 line-clamp-2">
              {tile.tagline}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-500">
            {host && <span>{host}</span>}
            {host && (tile.scopes.length > 0) && <span>·</span>}
            <div className="inline-flex flex-wrap gap-1">
              {tile.scopes.map((s, i) => (
                <span
                  key={s?.id ?? `personal-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-1.5 py-0.5 text-stone-600"
                >
                  {s ? <Users className="h-2.5 w-2.5" /> : null}
                  {s?.name ?? "Personal"}
                </span>
              ))}
            </div>
            {tile.totalCookCount > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {tile.totalCookCount}× cooked
                </span>
              </>
            )}
          </div>
        </div>
      </Link>

      {!selectable && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove from library"
          className="absolute right-2 bottom-2 rounded-full p-1.5 text-stone-400 opacity-0 transition hover:bg-stone-100 hover:text-rose-600 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
    </article>
  );
}
