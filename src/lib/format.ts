// Display helpers for server-rendered pages.

export function formatDateTime(iso: string | null): string {
  if (!iso) return "Not set";
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

export const STATUS_LABEL: Record<"draft" | "published", string> = {
  draft: "Draft",
  published: "Published",
};
