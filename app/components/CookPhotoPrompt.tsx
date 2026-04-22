"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, X, Check } from "lucide-react";

export function CookPhotoPrompt({
  cookLogId,
  onDismiss,
}: {
  cookLogId: string;
  onDismiss: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      const r = await fetch(`/api/cook-logs/${cookLogId}/photo`, {
        method: "POST",
        body: form,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? r.statusText);
      }
      const body = (await r.json()) as { photoUrl: string };
      setUploadedUrl(body.photoUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  if (uploadedUrl) {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm">
        <Image
          src={uploadedUrl}
          alt="Just-cooked"
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-md object-cover"
        />
        <span className="flex-1 text-emerald-900">
          <Check className="mr-1 inline h-3.5 w-3.5" />
          Photo saved to your library.
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
      <Camera className="h-4 w-4 shrink-0 text-amber-800" />
      <span className="flex-1 text-stone-800">
        How&apos;d it turn out? Add a photo for your library.
      </span>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
        {busy ? "Uploading…" : "Add photo"}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded-md p-1 text-stone-500 hover:bg-amber-100 hover:text-stone-900"
      >
        <X className="h-4 w-4" />
      </button>
      {error && (
        <span className="w-full text-xs text-rose-700">{error}</span>
      )}
    </div>
  );
}
