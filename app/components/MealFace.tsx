"use client";

// Roadmap item 1.8 — the shared visual primitive for any "meal-shaped"
// subject in the app. Renders a visual area (one of `video | photo |
// vignette | swatch`) plus an optional caption (title, tagline, mood
// eyebrow). Caller wraps with whatever interaction chrome they need
// (link, button, drag-drop, overflow menu, etc.) — MealFace is the visual
// alone.
//
// Consumers:
//   - RolodexTile (library) — wraps with photo upload, delete, cook chip.
//   - MenuView candidate tile (item 1.9) — wraps with commit button.
//   - Tonight surface (item 1.10) — wraps with "Cook this now" CTA.
//   - HostedMenu spread (item 2.17) — wraps with course-label header.
//
// The kind ladder resolves once: video > photo > vignette > swatch.
// Heroes are rendered as a still-life via VignetteArea (rotated overlapping
// sprites with warm drop shadows). Once item 1.13's transparent sprites
// land, the same algorithm starts looking like ingredients on cream paper
// instead of overlapping white squares — no MealFace change needed.

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Sprite } from "@/app/components/Sprite";

export type WashKey = "rose" | "ochre" | "emerald" | "amber";

export const WASH: Record<WashKey, { bg: string; ink: string; hint: string }> =
  {
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

const WASH_KEYS: WashKey[] = ["rose", "ochre", "emerald", "amber"];

function hashToIdx(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function pickWash(id: string): WashKey {
  return WASH_KEYS[hashToIdx(id, WASH_KEYS.length)];
}

export type MealFaceKind = "video" | "photo" | "generated" | "vignette" | "swatch";

export type MealFaceSubject = {
  // Stable id — drives deterministic wash pick. Caller must provide.
  id: string;
  title: string;
  tagline?: string | null;
  photoUrl?: string | null;
  videoUrl?: string | null;
  // AI-generated dish mockup. Slots between user photo and vignette in the
  // resolution ladder — only shown when no real photo or video exists. Renders
  // identically to a photo but with a subtle ✨ badge.
  generatedDishImageUrl?: string | null;
  heroIngredientSlugs?: string[];
  // Single mood eyebrow above the title (e.g. "FAST_FORGIVING" → "FAST · FORGIVING").
  // Caller picks one — MealFace renders at most one.
  moodTag?: string | null;
};

export type MealFaceSize = "tile" | "spread" | "peek";

const SIZE_HEIGHT: Record<MealFaceSize, number> = {
  tile: 160,
  spread: 380,
  peek: 480,
};

export function resolveMealFaceKind(subject: MealFaceSubject): MealFaceKind {
  if (subject.videoUrl) return "video";
  if (subject.photoUrl) return "photo";
  if (subject.generatedDishImageUrl) return "generated";
  if (subject.heroIngredientSlugs && subject.heroIngredientSlugs.length > 0) {
    return "vignette";
  }
  return "swatch";
}

function formatMoodTag(tag: string): string {
  return tag.replace(/_/g, " · ");
}

export type MealFaceProps = {
  subject: MealFaceSubject;
  size?: MealFaceSize;
  // Override the visual area height directly. RolodexTile uses this for its
  // tall variant (220px). Falls back to SIZE_HEIGHT[size].
  visualHeight?: number;
  showCaption?: boolean;
  className?: string;
};

export function MealFace({
  subject,
  size = "tile",
  visualHeight,
  showCaption = true,
  className = "",
}: MealFaceProps) {
  const kind = resolveMealFaceKind(subject);
  const wash = WASH[pickWash(subject.id)];
  const height = visualHeight ?? SIZE_HEIGHT[size];
  const captionPad = size === "spread" ? "px-6 py-4" : "px-4 py-3";
  const titleSize =
    size === "spread"
      ? "text-[26px]"
      : size === "peek"
      ? "text-[22px]"
      : "text-[18px]";
  const taglineSize =
    size === "spread" || size === "peek" ? "text-[15px]" : "text-[13px]";

  return (
    <div className={`overflow-hidden rounded-2xl bg-stone-50 ${className}`}>
      <div
        className="relative overflow-hidden"
        style={{
          height,
          background:
            kind === "photo" || kind === "video" || kind === "generated"
              ? "#efe5d0"
              : wash.bg,
        }}
      >
        {kind === "video" && subject.videoUrl && (
          <InViewVideo
            src={subject.videoUrl}
            poster={subject.photoUrl ?? undefined}
            title={subject.title}
          />
        )}
        {kind === "photo" && subject.photoUrl && (
          <Image
            src={subject.photoUrl}
            alt={subject.title}
            fill
            sizes="(min-width: 820px) 33vw, (min-width: 520px) 50vw, 100vw"
            className="object-cover"
            unoptimized={subject.photoUrl.startsWith("blob:")}
          />
        )}
        {kind === "generated" && subject.generatedDishImageUrl && (
          <>
            <Image
              src={subject.generatedDishImageUrl}
              alt={subject.title}
              fill
              sizes="(min-width: 820px) 33vw, (min-width: 520px) 50vw, 100vw"
              className="object-cover"
            />
            {/* Subtle "this is a mockup" affordance. Disappears the moment a
                real cook photo or video takes over (those branches never
                reach this code). */}
            <span
              aria-label="AI-generated mockup"
              title="AI-generated mockup of the dish"
              className="absolute bottom-2 right-2 inline-flex items-center justify-center rounded-full bg-stone-50/85 px-1.5 py-0.5 text-[11px] leading-none text-stone-700 backdrop-blur"
            >
              ✨
            </span>
          </>
        )}
        {kind === "vignette" && (
          <VignetteArea
            heroes={subject.heroIngredientSlugs ?? []}
            height={height}
          />
        )}
        {kind === "swatch" && (
          <SwatchCopy
            ink={wash.ink}
            tagline={subject.tagline ?? null}
            title={subject.title}
            size={size}
          />
        )}
      </div>

      {showCaption && (
        <div className={`flex flex-col gap-1.5 bg-stone-50 ${captionPad}`}>
          {subject.moodTag && (
            <span
              className="font-serif italic text-stone-500"
              style={{
                fontSize: "10.5px",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#8a6a2a",
              }}
            >
              {formatMoodTag(subject.moodTag)}
            </span>
          )}
          <h2
            className={`font-serif font-medium leading-tight tracking-tight text-stone-900 line-clamp-2 ${titleSize}`}
          >
            {subject.title}
          </h2>
          {subject.tagline && kind !== "swatch" && (
            <p
              className={`font-serif italic leading-snug text-stone-600 line-clamp-2 ${taglineSize}`}
            >
              {subject.tagline}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Internals — shared with RolodexTile's existing visual style ────────────

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
  size,
}: {
  ink: string;
  tagline: string | null;
  title: string;
  size: MealFaceSize;
}) {
  const pull = tagline ?? title;
  const pullSize = size === "spread" || size === "peek" ? "30px" : tagline ? "20px" : "24px";
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
          fontSize: pullSize,
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
      { threshold: 0.2 },
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
