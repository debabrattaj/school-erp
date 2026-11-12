export const DEFAULT_MARK_COLORS = { top: "#2563eb", passed: "#15803d", average: "#fbbf24", failed: "#dc2626" };
export const MARK_BAND_LABELS = { top: "Top marks", passed: "Passed", average: "Average band", failed: "Failed" };
export function scoreBand(mark, passPercentage = 40) {
  const maximum = Number(mark.max_marks || mark.total_marks || 0);
  if (["Exempt", "Absent", "Not assessed"].includes(mark.assessment_status) || !maximum) return null;
  const percent = mark.percentage ?? Number(mark.marks_obtained || 0) / maximum * 100;
  if (String(mark.grade || "").trim().toUpperCase() === "F" || percent < passPercentage) return "failed";
  if (percent >= 90) return "top";
  if (percent >= 75) return "passed";
  return "average";
}
export function contrastingText(hex) {
  const channels = [1,3,5].map((i) => parseInt(hex.slice(i,i+2),16)/255).map((v) => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return channels.reduce((sum,v,i) => sum + v * [.2126,.7152,.0722][i],0) > .179 ? "#000000" : "#ffffff";
}
