/**
 * Local calendar dates.
 *
 * `new Date().toISOString().slice(0, 10)` was used for "today" in seven places.
 * That is the date in UTC, not the user's: in IST (UTC+5:30) every moment
 * between midnight and 05:30 reports yesterday, so attendance was marked
 * against the wrong day, gate passes were filed against the wrong day, and
 * homework due today read as not-yet-due. These build the date from the local
 * calendar fields instead.
 */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" for a Date in the device's own timezone. */
export function toLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's date, in the device's own timezone. */
export function todayISO(): string {
  return toLocalISODate(new Date());
}

/**
 * Backend dates arrive as "YYYY-MM-DD" or as a full ISO timestamp. Both are
 * reduced to the plain date the pickers and comparisons work in.
 */
export function toISODate(raw?: string | null): string {
  if (!raw) return "";
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
