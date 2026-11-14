
"use client";

import { useId } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, Gauge } from "lucide-react";
import { useAppearance, type PerformanceChoice } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS: { value: PerformanceChoice; label: string; description: string }[] = [
  { value: "auto", label: "Automatic", description: "Use the default experience" },
  { value: "elegant", label: "Elegant", description: "Full background animation" },
  { value: "balanced", label: "Balanced", description: "Reduced background animation" },
  { value: "minimal", label: "Minimal", description: "Static background" },
];

export function PerformanceModeSelector({ className }: { className?: string }) {
  const id = useId();
  const { performanceChoice, setPerformanceChoice } = useAppearance();

  const selectedOption =
    OPTIONS.find((option) => option.value === performanceChoice) ?? OPTIONS[3];

  return (
    <Select.Root
      value={performanceChoice}
      onValueChange={(value) => {
        if (value) setPerformanceChoice(value as PerformanceChoice);
      }}
    >
      <Select.Trigger
        id={id}
        aria-label="Visual performance mode"
        className={cn(
          "group flex h-9 w-full items-center gap-2 rounded-xl border border-border/70",
          "bg-card/80 px-2.5 text-sm text-foreground shadow-sm backdrop-blur-xl",
          "transition-all duration-200",
          "hover:border-primary/40 hover:bg-accent/60",
          "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          "data-[popup-open]:border-primary/50 data-[popup-open]:bg-accent/70",
          className,
        )}
      >
        <Gauge className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />

        <span className="min-w-0 flex-1 truncate text-left font-medium">
          {selectedOption.label}
        </span>

        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[popup-open]:rotate-180" />
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          className="z-[100]"
        >
          <Select.Popup
            className={cn(
              "w-[var(--anchor-width)] min-w-52 overflow-hidden rounded-xl",
              "border border-border/80 bg-popover/95 p-1.5 text-popover-foreground",
              "shadow-xl shadow-black/10 backdrop-blur-2xl",
              "origin-[var(--transform-origin)]",
              "data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95",
              "data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95",
              "duration-150",
            )}
          >
            <Select.List className="flex flex-col gap-1">
              {OPTIONS.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className={cn(
                    "group/item relative flex w-full cursor-pointer items-center gap-3",
                    "rounded-lg px-3 py-2.5 text-left outline-none",
                    "transition-colors duration-150",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus-visible:bg-accent focus-visible:text-accent-foreground",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                    "data-[selected]:bg-primary/10 data-[selected]:text-primary",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>

                  <Select.ItemIndicator>
                    <Check className="size-4 shrink-0 text-primary" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
