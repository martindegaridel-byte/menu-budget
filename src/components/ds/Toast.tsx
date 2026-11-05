"use client";
import { CheckCircle2, Info, TriangleAlert, Undo2, X, type LucideIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn, ICON_STROKE } from "./cn";

export type ToastTone = "success" | "info" | "warn" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Durée d'affichage en ms (défaut 4 000 ; 6 000 avec « Annuler »). */
  duration?: number;
  /** Ajoute un bouton « Annuler » qui appelle cette fonction. */
  onUndo?: () => void;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((t: ToastOptions) => void) | null>(null);

/** `const toast = useToast(); toast({ title: "Placard enregistré", onUndo })` */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé dans <ToastProvider>");
  return ctx;
}

const TONE: Record<ToastTone, { icon: LucideIcon; color: string }> = {
  success: { icon: CheckCircle2, color: "text-accent-text" },
  info: { icon: Info, color: "text-muted" },
  warn: { icon: TriangleAlert, color: "text-warn-text" },
  error: { icon: TriangleAlert, color: "text-danger-text" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((t: ToastOptions) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { ...t, id }]); // 3 toasts au plus
  }, []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* En haut, sans bloquer la page : seul le toast lui-même capte les clics. */}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))]"
      >
        {items.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const duration = toast.duration ?? (toast.onUndo ? 6000 : 4000);
  const remaining = useRef(duration);
  const started = useRef(0);

  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const timer = setTimeout(onDismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started.current;
    };
  }, [paused, onDismiss]);

  const { icon: Icon, color } = TONE[toast.tone ?? "success"];
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex w-full max-w-md animate-toast-in items-start gap-3 rounded-card bg-glass p-3 pl-4 shadow-lift ring-1 ring-inset ring-line-strong backdrop-blur-xl",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", color)} strokeWidth={ICON_STROKE} />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-body-sm font-medium text-fg">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-caption text-muted">{toast.description}</p>}
      </div>
      {toast.onUndo && (
        <button
          type="button"
          onClick={() => {
            toast.onUndo?.();
            onDismiss();
          }}
          className="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1 rounded-field px-2 text-body-sm font-semibold text-accent-text transition-colors duration-150 hover:bg-accent-soft"
        >
          <Undo2 aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
          Annuler
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer la notification"
        className="focus-ring grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-3 hover:text-fg"
      >
        <X aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
      </button>
    </div>
  );
}
