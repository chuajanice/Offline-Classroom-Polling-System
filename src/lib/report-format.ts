// Date and time formatting for reports (Stage 6). Pure: unit-tested directly.
// Local time zone of the server, like the rest of the report.

const pad = (n: number) => String(n).padStart(2, "0");

/** MM/DD/YYYY, always two digits for month and day. */
export function formatReportDate(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}

/** Time of day, 12-hour clock, e.g. "9:05 AM". Kept separate from the date column. */
export function formatReportTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
}
