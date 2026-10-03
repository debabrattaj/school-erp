import React from "react";
import { api } from "../../../api/client";
import DashboardScreen from "../DashboardScreen";
import { attendanceTotal, boundedPercentage, reportQuery } from "../dashboardData";
import { DashboardChart, FinanceGauge } from "../DashboardCharts";

const { act, create } = require("react-test-renderer");
jest.setTimeout(30000);
jest.mock("../../../api/client", () => ({ api: { get: jest.fn() }, ApiError: class extends Error {} }));
jest.mock("../../../auth/AuthContext", () => ({ useAuth: () => ({ user: { name: "Test Admin", account: { name: "Demo School" } } }) }));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => require("react").useEffect(callback, [callback]),
}));

const get = api.get as jest.Mock;
let screen: any;
function visibleText(node: any = screen.toJSON()): string {
  if (node == null) return "";
  if (typeof node !== "object") return String(node);
  return (Array.isArray(node) ? node : node.children || []).map((child: any) => visibleText(child)).join(" ");
}
async function selectMyDashboard() {
  const tab = screen.root.findAll((item: any) => item.props.accessibilityRole === "tab" && item.props.onPress && item.props.accessibilityState?.selected === false)[0];
  await act(async () => { tab.props.onPress(); });
}
beforeEach(() => {
  get.mockImplementation((path: string) => {
    if (path === "/dashboard/summary") return Promise.resolve({
      total_students: 923, today_present: 80, today_absent: 10, today_late: 5, today_excused: 5,
      attendance_percentage: 80, total_collection: 1000, total_due: 200, collection_percentage: 83.33,
      transport_users: 120, international_students: 3,
    });
    if (path === "/settings/") return Promise.resolve({ currency: "INR" });
    if (path === "/students/") return Promise.resolve([]);
    if (path === "/dashboard/trends") return Promise.resolve({ attendance_trend: [] });
    if (path === "/dashboard/layout") return Promise.resolve({ widgets: [{
      id: "saved", title: "My saved collections", source: "fees", groupBy: "fee_type", measure: "paid_amount",
      academicYear: "2026-27", dateFrom: "2026-04-01", status: "Paid", chartType: "stat",
    }] });
    return Promise.resolve({ labels: ["Tuition"], values: [1000], is_currency: true });
  });
});
afterEach(async () => { if (screen) await act(async () => screen.unmount()); jest.clearAllMocks(); });

it("shows the missing overview sections and derives attendance from returned status counts", async () => {
  await act(async () => { screen = create(<DashboardScreen />); });
  const rendered = visibleText();
  for (const label of ["Overview", "My Dashboard", "923", "Finance Health", "Student Profile Mix", "Transport Users", "Students by Class", "Attendance Today", "Recent Admissions", "Grade Distribution"]) {
    expect(rendered).toContain(label);
  }
  expect(attendanceTotal({ today_present: 80, today_absent: 10, today_late: 5, today_excused: 5 })).toBe(100);
  expect(attendanceTotal({})).toBe(0);
});

it("loads saved web widgets with their filters when My Dashboard is selected", async () => {
  await act(async () => { screen = create(<DashboardScreen />); });
  await selectMyDashboard();
  expect(visibleText()).toContain("My saved collections");
  expect(get).toHaveBeenCalledWith("/dashboard/report", expect.objectContaining({
    source: "fees", group_by: "fee_type", measure: "paid_amount", academic_year: "2026-27", date_from: "2026-04-01", status: "Paid",
  }));
});

it("keeps summary figures visible when chart endpoints fail", async () => {
  const original = get.getMockImplementation()!;
  get.mockImplementation((path, ...args) => path === "/dashboard/report" || path === "/dashboard/trends"
    ? Promise.reject(new Error("Unavailable")) : original(path, ...args));
  await act(async () => { screen = create(<DashboardScreen />); });
  const rendered = visibleText();
  expect(rendered).toContain("923");
  expect(rendered).toContain("This report could not be loaded.");
  expect(rendered).toContain("Attendance trend could not be loaded.");
});

it("preserves an intentionally empty saved dashboard", async () => {
  const original = get.getMockImplementation()!;
  get.mockImplementation((path, ...args) => path === "/dashboard/layout" ? Promise.resolve({ widgets: [] }) : original(path, ...args));
  await act(async () => { screen = create(<DashboardScreen />); });
  await selectMyDashboard();
  expect(visibleText()).toContain("No saved widgets yet.");
});

it("bounds bar widths and forwards both date filters", () => {
  expect(boundedPercentage(130)).toBe(100);
  expect(boundedPercentage(-10)).toBe(0);
  expect(boundedPercentage(NaN)).toBe(0);
  expect(reportQuery({ id: "a", title: "A", source: "fees", groupBy: "fee_type", measure: "count", dateFrom: "2026-01-01", dateTo: "2026-02-01" })).toMatchObject({ date_from: "2026-01-01", date_to: "2026-02-01" });
});

it.each(["bar", "donut", "pie", "line", "area", "table"])("renders a %s chart instead of a progress-bar substitute", async kind => {
  await act(async () => { screen = create(<DashboardChart kind={kind} data={[{ label: "Class 1", value: 30 }, { label: "Class 2", value: 20 }]} />); });
  expect(screen.root.findAllByProps({ testID: `${kind}-chart` }).length).toBeGreaterThan(0);
  expect(visibleText()).toContain("Class 1");
});

it("keeps the zero-collection gauge visible", async () => {
  await act(async () => { screen = create(<FinanceGauge percentage={0} />); });
  expect(screen.root.findAllByProps({ testID: "finance-gauge" }).length).toBeGreaterThan(0);
  expect(screen.root.findAllByProps({ accessibilityLabel: "Fee collection: 0%" }).length).toBeGreaterThan(0);
});

it("breaks attendance trend paths at missing days", async () => {
  await act(async () => { screen = create(<DashboardChart kind="line" data={[
    { label: "Mon", value: 80 }, { label: "Tue", value: null }, { label: "Wed", value: 90 },
  ]} />); });
  const paths = screen.root.findAll((node: any) => typeof node.props.d === "string" && node.props.strokeWidth === 3);
  expect(paths.length).toBeGreaterThanOrEqual(2);
  expect(paths.every((node: any) => !node.props.d.includes("L"))).toBe(true);
  expect(visibleText()).toContain("No records");
});
