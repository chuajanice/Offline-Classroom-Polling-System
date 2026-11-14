
"use client";

import { useState } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, School } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Classroom = {
  id: number;
  classroomName: string;
};

export function ClassroomFilter({
  classrooms,
  initialValue,
}: {
  classrooms: Classroom[];
  initialValue: string;
}) {
  const [selected, setSelected] = useState(initialValue || "all");

  const selectedClassroom = classrooms.find(
    (classroom) => String(classroom.id) === selected,
  );

  const selectedLabel = selected === "all"
    ? "All classrooms"
    : selectedClassroom?.classroomName ?? "All classrooms";

  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <input
        type="hidden"
        name="classroomId"
        value={selected === "all" ? "" : selected}
      />

      <div className="space-y-1">
        <label className="text-sm font-medium">
          Classroom
        </label>

        <Select.Root
          value={selected}
          onValueChange={(value) => setSelected(value ?? "all")}
        >
          <Select.Trigger
            aria-label="Filter by classroom"
            className={cn(
              "group flex h-9 min-w-48 items-center gap-2 rounded-xl",
              "border border-border/70 bg-card/80 px-3 text-sm text-foreground",
              "shadow-sm backdrop-blur-xl transition-all duration-200",
              "hover:border-primary/40 hover:bg-accent/60",
              "focus-visible:border-ring focus-visible:outline-none fodata-[popup-open]:bg-accent/70cus-visible:ring-2 focus-visible:ring-ring/50",
              "data-[popup-open]:border-primary/50 ",
            )}
          >
            <School className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />

            <span className="min-w-0 flex-1 truncate text-left font-medium">
              {selectedLabel}
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
                <Select.List className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                  <Select.Item
                    value="all"
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                      "text-sm outline-none transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus-visible:bg-accent focus-visible:text-accent-foreground",
                      "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                      "data-[selected]:bg-primary/10 data-[selected]:text-primary",
                    )}
                  >
                    <span className="flex-1 text-left font-medium">
                      All classrooms
                    </span>
                    <Select.ItemIndicator>
                      <Check className="size-4 text-primary" />
                    </Select.ItemIndicator>
                  </Select.Item>

                  {classrooms.map((classroom) => (
                    <Select.Item
                      key={classroom.id}
                      value={String(classroom.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                        "text-sm outline-none transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:bg-accent focus-visible:text-accent-foreground",
                        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                        "data-[selected]:bg-primary/10 data-[selected]:text-primary",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-left font-medium">
                        {classroom.classroomName}
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
      </div>

      <Button type="submit" variant="outline">
        Filter
      </Button>
    </form>
  );
}
