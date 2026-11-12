// Conversions between the browser's <input type="datetime-local"> values
// (local wall-clock time, no zone) and ISO-8601 UTC strings used by the API.
// Pure functions; safe in client and server code.

/** ISO timestamp -> "YYYY-MM-DDTHH:mm" in the browser's local time, or "". */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** datetime-local value (local time) -> ISO string, or null when empty or invalid. */
export function localInputToIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
