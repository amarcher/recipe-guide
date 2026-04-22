"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  // 'danger' = rose button (destructive); 'primary' = stone-900
  tone?: "danger" | "primary";
};

type ConfirmRequest = ConfirmOptions & {
  resolve: (v: boolean) => void;
};

const ConfirmCtx = createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function useConfirm() {
  const fn = useContext(ConfirmCtx);
  if (!fn) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return fn;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  const open = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setReq({ ...opts, resolve });
    });
  }, []);

  const close = useCallback(
    (v: boolean) => {
      if (req) {
        req.resolve(v);
        setReq(null);
      }
    },
    [req]
  );

  useEffect(() => {
    if (!req) return;
    confirmBtn.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [req, close]);

  const tone = req?.tone ?? "danger";
  const confirmClass =
    tone === "danger"
      ? "bg-rose-700 hover:bg-rose-800 text-white"
      : "bg-stone-900 hover:bg-stone-800 text-stone-50";

  return (
    <ConfirmCtx.Provider value={open}>
      {children}
      {req && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
        >
          <div
            aria-hidden
            onClick={() => close(false)}
            className="absolute inset-0 bg-stone-950/40 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-stone-200 bg-stone-50 p-6 shadow-xl">
            <h2
              id="confirm-title"
              className="font-serif text-xl font-medium tracking-tight text-stone-900"
            >
              {req.title}
            </h2>
            {req.message && (
              <div className="mt-2 text-sm leading-snug text-stone-600">
                {req.message}
              </div>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg border border-stone-300 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
              >
                {req.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmBtn}
                type="button"
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-stone-400 ${confirmClass}`}
              >
                {req.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
