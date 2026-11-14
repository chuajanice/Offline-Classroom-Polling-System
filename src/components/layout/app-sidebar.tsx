"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActivePath } from "@/components/layout/nav-items";

// Desktop navigation (lg and wider). Hidden on smaller screens, where MobileNavigation applies.
export function AppSidebar({ fullName, email }: { fullName: string; email: string }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-border bg-card p-4 lg:flex">
      <div className="px-2 pt-2">
        <p className="text-lg font-semibold tracking-tight">Pollify</p>
        <p className="text-xs text-muted-foreground">Offline classroom polling</p>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "bg-primary/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon aria-hidden="true" className={cn("size-4 shrink-0", active && "text-primary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-border p-3">
        <p className="truncate text-sm font-medium">{fullName}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
    </aside>
  );
}
