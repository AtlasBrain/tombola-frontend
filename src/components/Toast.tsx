"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  push: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_TTL_MS = 3500;
const MAX_VISIBLE = 4;

// Mint = brand accent for success (emerald is not in the palette).
// Rose stays for error since rose-500 is the brand's reserved error tone.
const KIND_STYLE: Record<ToastKind, string> = {
  success:
    "border-[#88cfc4]/30 bg-[#88cfc4]/10 text-[#d1ece8] [&>span:first-child]:bg-[#88cfc4]/20 [&>span:first-child]:text-[#88cfc4]",
  error:
    "border-rose-500/30 bg-rose-500/10 text-rose-100 [&>span:first-child]:bg-rose-500/20 [&>span:first-child]:text-rose-300",
  info: "border-neutral-700 bg-neutral-900/90 text-neutral-100 [&>span:first-child]:bg-neutral-800 [&>span:first-child]:text-neutral-300",
};

const KIND_ICON: Record<ToastKind, string> = {
  success: "✓",
  error: "✗",
  info: "i",
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId++;
      setToasts((curr) => [...curr, { id, kind, message }].slice(-MAX_VISIBLE));
      const handle = setTimeout(() => dismiss(id), TOAST_TTL_MS);
      timers.current.set(id, handle);
    },
    [dismiss],
  );

  // Clear pending timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-end gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md transition-all sm:w-auto ${KIND_STYLE[t.kind]}`}
          >
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold">
              {KIND_ICON[t.kind]}
            </span>
            <span className="flex-1 break-words">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-m-1 p-1 text-neutral-400 transition-colors hover:text-neutral-200"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}
