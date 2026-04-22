"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function LibraryCardMedia({
  recipeId,
  photoUrl,
  title,
}: {
  recipeId: string;
  photoUrl: string | null;
  title: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const shown = localUrl ?? photoUrl;

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("not an image");
      return;
    }
    setError(null);
    setUploading(true);
    const preview = URL.createObjectURL(file);
    setLocalUrl(preview);
    try {
      const form = new FormData();
      form.append("photo", file);
      const r = await fetch(`/api/recipes/${recipeId}/photo`, {
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
      setError(e instanceof Error ? e.message : "upload failed");
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

  function onDragLeave() {
    setDragOver(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void upload(f);
  }

  function onPick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    fileInput.current?.click();
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative -mx-4 -mt-4 mb-3 aspect-[16/9] overflow-hidden rounded-t-xl bg-stone-100 transition ${
        dragOver ? "ring-2 ring-amber-500 ring-offset-2" : ""
      }`}
    >
      {shown ? (
        <Image
          src={shown}
          alt={title}
          fill
          sizes="(min-width: 640px) 50vw, 100vw"
          className="object-cover"
          unoptimized={shown.startsWith("blob:")}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-stone-400">
          <Camera className="h-5 w-5" />
          <span className="text-[11px] uppercase tracking-wider">Drop a photo</span>
        </div>
      )}

      {(uploading || dragOver) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <span className="text-xs font-medium">Drop to upload</span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onPick}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-stone-800 shadow-sm hover:bg-white"
        aria-label="Add photo"
      >
        <ImagePlus className="h-3 w-3" />
        {shown ? "Change" : "Add photo"}
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

      {error && (
        <div className="absolute bottom-1 left-1 right-1 rounded bg-rose-900/80 px-2 py-1 text-[11px] text-white">
          {error}
        </div>
      )}
    </div>
  );
}
