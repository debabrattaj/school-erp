// Local-timezone date helpers.
//
// Using `new Date().toISOString()` yields a UTC date, so in the evening for
// schools west of UTC "today" wrongly rolls to tomorrow. These helpers use the
// browser's local calendar date instead, which is what a user entering data
// actually means.

export function todayLocalDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
