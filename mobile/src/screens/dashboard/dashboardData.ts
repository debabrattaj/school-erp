export interface Report { labels: string[]; values: number[]; is_currency?: boolean }
export interface Widget {
  id: string; title: string; source: string; groupBy: string; measure: string;
  chartType?: string; academicYear?: string; status?: string; dateFrom?: string; dateTo?: string;
}
export function reportQuery(w: Widget) {
  return { source: w.source, group_by: w.groupBy, measure: w.measure,
    academic_year: w.academicYear || undefined, status: w.status || undefined,
    date_from: w.dateFrom || undefined, date_to: w.dateTo || undefined, limit: 50 };
}
export function attendanceTotal(s: { today_present?: number; today_absent?: number; today_late?: number; today_excused?: number }) {
  return (s.today_present ?? 0) + (s.today_absent ?? 0) + (s.today_late ?? 0) + (s.today_excused ?? 0);
}
export function boundedPercentage(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}
export function money(value: number, currency = "INR") {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toLocaleString("en-IN")}`; }
}
export const starterWidgets: Widget[] = [
  { id: "class", title: "Students by Class", source: "students", groupBy: "class_name", measure: "count", chartType: "bar" },
  { id: "collected", title: "Collected by Fee Type", source: "fees", groupBy: "fee_type", measure: "paid_amount", chartType: "bar" },
  { id: "grades", title: "Grade Distribution", source: "marks", groupBy: "grade", measure: "count", chartType: "bar" },
  { id: "due", title: "Outstanding by Status", source: "fees", groupBy: "payment_status", measure: "due_amount", chartType: "bar" },
];
