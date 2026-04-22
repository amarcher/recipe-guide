"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, ImagePlus, Loader2, Trash2, Users } from "lucide-react";
import type { CookCard } from "@/app/types";
import { Sprite } from "@/app/components/Sprite";
import { deleteRecipe } from "@/app/lib/storage";
import { useConfirm } from "@/app/components/ConfirmDialog";

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

export type TileKind = "video" | "photo" | "vignette" | "swatch";

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
  // Prefer video when we have one AND no user-uploaded photo override.
  // A locally uploaded photo (via the corner button) takes precedence so the
  // user always has a way to replace the Instagram video with their own shot.
  const kind: TileKind =
    !localUrl && tile.videoUrl
      ? "video"
      : shownPhoto
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
      <Link
        href={tileHref}
        onClick={onSelectClick}
        className="block"
      >
        {/* Visual */}
        <div
          className="relative overflow-hidden"
          style={{
            height: visualHeight,
            background:
              kind === "photo" || kind === "video" ? "#efe5d0" : wash.bg,
          }}
        >
          {kind === "video" && tile.videoUrl && (
            <InViewVideo
              src={tile.videoUrl}
              poster={tile.photoUrl ?? undefined}
              title={tile.title}
            />
          )}

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
            <SwatchCopy
              ink={wash.ink}
              tagline={tile.tagline}
              title={tile.title}
            />
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

        {/* Caption */}
        <div className="flex flex-col gap-2 bg-stone-50 px-4 py-3">
          <h2 className="font-serif text-[18px] font-medium leading-tight tracking-tight text-stone-900 line-clamp-2">
            {tile.title}
          </h2>

          {/* Tagline only shows on non-swatch tiles; swatch already leads with it. */}
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

// Autoplay muted loops are gorgeous in a grid but expensive if they all run
// at once. IntersectionObserver gates playback to tiles actually in view.
// Safari also refuses to autoplay a video that isn't muted AND playsInline.
function InViewVideo({
  src,
  poster,
  title,
}: {
  src: string;
  poster: string | undefined;
  title: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.play().catch(() => {});
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) el.play().catch(() => {});
          else el.pause();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={title}
      className="absolute inset-0 h-full w-full object-cover"
    />
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

function SwatchCopy({
  ink,
  tagline,
  title,
}: {
  ink: string;
  tagline: string | null;
  title: string;
}) {
  const pull = tagline ?? title;
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
          fontSize: tagline ? "20px" : "24px",
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          textWrap: "pretty",
        }}
      >
        &ldquo;{pull}&rdquo;
      </span>
    </div>
  );
}
