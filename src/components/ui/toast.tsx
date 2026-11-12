"use client";

// Compact corner notifications. Written in-house (no extra package): a context,
// a provider that renders the stack, and a useToast() hook.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleCheck, CircleX, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "success" | "error" | "warning";
type ToastItem = { id: number; title: string; description?: string; variant: Variant };
type ToastInput = { title: string; description?: string; variant?: Variant };

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);
const VISIBLE_LIMIT = 3;
const AUTO_DISMISS_MS = 4500;

const ICON = { success: CircleCheck, error: CircleX, warning: TriangleAlert } as const;
const TONE = {
  success: "text-emerald-600",
  error: "text-destructive",
  warning: "text-orange-600",
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const item: ToastItem = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? "success",
      };
      setItems((current) => [...current.slice(-(VISIBLE_LIMIT - 1)), item]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      >
        {items.map((item) => {
          const Icon = ICON[item.variant];
          return (
            <div
              key={item.id}
              role={item.variant === "error" ? "alert" : "status"}
              className="pointer-events-auto flex items-start gap-3 rounded-xl bg-background p-3 shadow-lg ring-1 ring-foreground/10 transition-all duration-200"
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", TONE[item.variant])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}
