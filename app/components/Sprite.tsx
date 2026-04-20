"use client";

import Image from "next/image";
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

  // next/image doesn't optimize data URLs (and shouldn't try) — fall back to
  // a plain img for the rare case we hand back base64 from the discover route
  // (only happens if BLOB_READ_WRITE_TOKEN is missing on the server).
  if (url.startsWith("data:")) {
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

  return (
    <Image
      src={url}
      alt={name}
      width={size}
      height={size}
      onError={() => setBrokenUrl(url)}
      className={`flex-none object-contain ${className}`}
      // Tell the optimizer the actual rendered density so it picks an
      // appropriately-sized variant rather than serving the source.
      sizes={`${size}px`}
      unoptimized={false}
    />
  );
}
