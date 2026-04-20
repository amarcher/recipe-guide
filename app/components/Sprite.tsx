"use client";

import { useState } from "react";
import { useSpriteUrl } from "@/app/lib/sprites";

export function Sprite({
  name,
  size = 32,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const url = useSpriteUrl(name);
  // Track which URL failed so a future URL change can recover.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  if (!url || brokenUrl === url) {
    const initial = (name.match(/[A-Za-z]/)?.[0] ?? "?").toUpperCase();
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className={`inline-flex flex-none items-center justify-center rounded-full bg-stone-200 text-[11px] font-semibold text-stone-500 ${className}`}
      >
        {initial}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      onError={() => setBrokenUrl(url)}
      className={`flex-none object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
