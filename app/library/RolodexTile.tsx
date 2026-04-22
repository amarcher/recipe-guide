"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, ImagePlus, Loader2, Trash2, Users } from "lucide-react";
import type { CookCard } from "@/app/types";
import { Sprite } from "@/app/components/Sprite";
import { deleteRecipe } from "@/app/lib/storage";

export type WashKey = "rose" | "ochre" | "emerald" | "amber";

const WASH: Record<WashKey, { bg: string; ink: string; hint: string }> = {
  rose: {
    bg: "linear-gradient(160deg, #fbe2d9 0%, #f3c2b3 100%)",
    ink: "#5a2a1e",
    hint: "rgba(90,42,30,.55)",
  },
  ochre: {
    bg: "linear-gradient(160deg, #f7e2b8 0%, #ead09a 100%)",
    ink: "#4a3312",
    hint: "rgba(74,51,18,.55)",
  },
  emerald: {
    bg: "linear-gradient(160deg, #d4e4c9 0%, #b8d1a9 100%)",
    ink: "#243d1c",
    hint: "rgba(36,61,28,.55)",
  },
  amber: {
    bg: "linear-gradient(160deg, #f4d99a 0%, #e6bf6e 100%)",
    ink: "#553612",
    hint: "rgba(85,54,18,.55)",
  },
};

export type TileKind = "photo" | "vignette" | "swatch";

export type TileData = {
  id: string;
  title: string;
  sourceUrl: string;
  photoUrl: string | null;
  heroes: string[];
  totalCookCount: number;
  latestLastCookedAt: number | null;
  savedAt: number;
  scopes: Array<{ id: string; name: string } | null>;
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

function hashToIdx(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

const WASH_KEYS: WashKey[] = ["rose", "ochre", "emerald", "amber"];

export function pickWash(id: string): WashKey {
  return WASH_KEYS[hashToIdx(id, WASH_KEYS.length)];
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
}: {
  tile: TileData;
  tall: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const shownPhoto = localUrl ?? tile.photoUrl;
  const kind: TileKind = shownPhoto
    ? "photo"
    : tile.heroes.length > 0
    ? "vignette"
    : "swatch";
  const wash = WASH[pickWash(tile.id)];
  const visualHeight = tall ? 220 : 160;

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

  function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Remove "${tile.title}" from your library?`)) return;
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

  return (
    <article
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className="group relative mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-stone-300 bg-stone-50 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-md"
      style={{ transitionDuration: "180ms" }}
    >
      <Link href={`/recipe/${tile.id}`} className="block">
        {/* Visual */}
        <div
          className="relative overflow-hidden"
          style={{
            height: visualHeight,
            background: kind === "photo" ? "#efe5d0" : wash.bg,
          }}
        >
          {kind === "photo" && shownPhoto && (
            <Image
              src={shownPhoto}
              alt={tile.title}
              fill
              sizes="(min-width: 820px) 33vw, (min-width: 520px) 50vw, 100vw"
              className="object-cover"
              unoptimized={shownPhoto.startsWith("blob:")}
            />
          )}

          {kind === "vignette" && (
            <VignetteArea heroes={tile.heroes} height={visualHeight} />
          )}

          {kind === "swatch" && (
            <SwatchCopy ink={wash.ink} title={tile.title} />
          )}

          {(dragOver || uploading) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <span className="text-xs font-medium">Drop to upload</span>
              )}
            </div>
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

          <button
            type="button"
            onClick={onPickPhoto}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-stone-50/90 px-2 py-1 text-[11px] font-medium text-stone-800 shadow-sm backdrop-blur transition hover:bg-stone-50"
            aria-label={shownPhoto ? "Change photo" : "Add photo"}
          >
            <ImagePlus className="h-3 w-3" />
            {shownPhoto ? "Change" : "Add photo"}
          </button>

          {uploadError && (
            <div className="absolute bottom-2 left-2 right-2 rounded bg-rose-900/80 px-2 py-1 text-[11px] text-stone-50">
              {uploadError}
            </div>
          )}
        </div>

        {/* Caption */}
        <div className="flex flex-col gap-2 bg-stone-50 px-4 py-3">
          <h2 className="font-serif text-[18px] font-medium leading-tight tracking-tight text-stone-900 line-clamp-2">
            {tile.title}
          </h2>

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

      <button
        type="button"
        onClick={onDelete}
        aria-label="Remove from library"
        className="absolute right-2 bottom-2 rounded-full p-1.5 text-stone-400 opacity-0 transition hover:bg-stone-100 hover:text-rose-600 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

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

function VignetteArea({
  heroes,
  height,
}: {
  heroes: string[];
  height: number;
}) {
  return (
    <div className="absolute inset-0">
      {heroes.map((name, i) => {
        const size = i === 0 ? height * 0.82 : height * (0.5 - i * 0.08);
        const left = i === 0 ? "8%" : `${20 + i * 22}%`;
        const bottom = i === 0 ? "-14%" : `${8 + (i % 2) * 18}%`;
        const rot = i === 0 ? -6 : i % 2 === 0 ? 8 : -12;
        return (
          <div
            key={`${name}-${i}`}
            className="absolute"
            style={{
              left,
              bottom,
              width: size,
              height: size,
              transform: `rotate(${rot}deg)`,
              filter: "drop-shadow(0 8px 14px rgba(60,40,15,.2))",
              zIndex: heroes.length - i,
            }}
          >
            <Sprite name={name} size={Math.round(size)} />
          </div>
        );
      })}
    </div>
  );
}

function SwatchCopy({ ink, title }: { ink: string; title: string }) {
  const first = title.split(/\s+/).slice(0, 2).join(" ");
  return (
    <div className="flex h-full flex-col items-start justify-end p-5">
      <span
        className="font-serif italic"
        style={{
          color: ink,
          opacity: 0.55,
          fontSize: "11px",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        — from the archive
      </span>
      <span
        className="mt-2 font-serif italic"
        style={{
          color: ink,
          fontSize: "24px",
          lineHeight: 1.15,
          letterSpacing: "-0.01em",
          textWrap: "pretty",
        }}
      >
        &ldquo;{first}&rdquo;
      </span>
    </div>
  );
}
