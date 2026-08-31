import React, { useMemo } from "react";
import { createDrawerNavigator, DrawerToggleButton } from "@react-navigation/drawer";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import DashboardScreen from "../screens/dashboard/DashboardScreen";
import AttendanceScreen from "../screens/attendance/AttendanceScreen";
import MarksScreen from "../screens/marks/MarksScreen";
import SettingsNavigator from "./SettingsNavigator";
import PayrollScreen from "../screens/payroll/PayrollScreen";
import ReportsScreen from "../screens/reports/ReportsScreen";
import ReportCardScreen from "../screens/reportcard/ReportCardScreen";
import CertificatesScreen from "../screens/certificates/CertificatesScreen";
import AssistantScreen from "../screens/assistant/AssistantScreen";
import SearchScreen from "../screens/search/SearchScreen";
import PortalAccessScreen from "../screens/portalaccess/PortalAccessScreen";
import LeaveScreen from "../screens/leave/LeaveScreen";
import GateScreen from "../screens/gate/GateScreen";
import CommunicationsScreen from "../screens/communications/CommunicationsScreen";
import SyllabusScreen from "../screens/syllabus/SyllabusScreen";
import { staffModules } from "../modules/configs";
import { MODULE_GROUPS, ModuleConfig, ModuleGroup } from "../modules/types";
import { createModuleStack } from "./ModuleStack";
import DrawerContent from "./DrawerContent";
import NoAccessScreen from "../screens/NoAccessScreen";
import { useAuth } from "../auth/AuthContext";
import { hasAccess } from "../auth/types";
import { colors } from "../theme/theme";
import LogoutButton from "./LogoutButton";

const Drawer = createDrawerNavigator();

// The drawer itself renders no header, so each stack's own header has to carry
// the control that opens it — without this there is no way in but an edge
// swipe, which Android's gesture navigation swallows as "back".
const drawerButton = () => <DrawerToggleButton tintColor={colors.text} />;

/**
 * Wraps a single screen in its own stack so it gets a header (and with it the
 * drawer button), matching how each module stack is presented.
 */
function singleScreenStack(name: string, title: string, Component: React.ComponentType<any>) {
  const Stack = createNativeStackNavigator();
  return function Wrapped() {
    return (
      <Stack.Navigator
        screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}
      >
        <Stack.Screen
          name={name}
          component={Component}
          options={{ title, headerLeft: drawerButton, headerRight: () => <LogoutButton /> }}
        />
      </Stack.Navigator>
    );
  };
}

// Built at module scope: these are component types, so creating them inside the
// navigator would remount the screen on every render.
const DashboardStackScreen = singleScreenStack("DashboardHome", "Dashboard", DashboardScreen);
const AttendanceStackScreen = singleScreenStack("AttendanceHome", "Attendance", AttendanceScreen);
const MarksStackScreen = singleScreenStack("MarksHome", "Marks", MarksScreen);
const PayrollStackScreen = singleScreenStack("PayrollHome", "Payroll", PayrollScreen);
const ReportsStackScreen = singleScreenStack("ReportsHome", "Reports", ReportsScreen);
const ReportCardStackScreen = singleScreenStack("ReportCardHome", "Report Card", ReportCardScreen);
const CertificatesStackScreen = singleScreenStack("CertificatesHome", "Certificates", CertificatesScreen);
const AssistantStackScreen = singleScreenStack("AssistantHome", "Assistant", AssistantScreen);
const SearchStackScreen = singleScreenStack("SearchHome", "Search", SearchScreen);
const PortalAccessStackScreen = singleScreenStack("PortalAccessHome", "Portal Access", PortalAccessScreen);
const LeaveStackScreen = singleScreenStack("LeaveHome", "Leave", LeaveScreen);
const GateStackScreen = singleScreenStack("GateHome", "Gate Register", GateScreen);
const CommunicationsStackScreen = singleScreenStack("CommunicationsHome", "Communication", CommunicationsScreen);
const SyllabusStackScreen = singleScreenStack("SyllabusHome", "Syllabus & Lesson Plans", SyllabusScreen);

/**
 * The bespoke (non-CRUD) screens, filed into the same drawer groups the web
 * sidebar uses so both clients present an identical menu.
 */
const BESPOKE: {
  name: string;
  title: string;
  icon: string;
  group: ModuleGroup;
  feature: string;
  Component: React.ComponentType<any>;
}[] = [
  { name: "Dashboard", title: "Dashboard", icon: "Db", group: "Overview", feature: "dashboard", Component: DashboardStackScreen },
  { name: "Search", title: "Search", icon: "Sr", group: "Overview", feature: "dashboard", Component: SearchStackScreen },
  { name: "Assistant", title: "Assistant", icon: "Ai", group: "Overview", feature: "dashboard", Component: AssistantStackScreen },
  { name: "Attendance", title: "Attendance", icon: "At", group: "Academics", feature: "attendance", Component: AttendanceStackScreen },
  { name: "Marks", title: "Marks", icon: "Mk", group: "Academics", feature: "marks", Component: MarksStackScreen },
  { name: "ReportCard", title: "Report Card", icon: "Rc", group: "Academics", feature: "marks", Component: ReportCardStackScreen },
  { name: "Certificates", title: "Certificates", icon: "Ce", group: "Students", feature: "students", Component: CertificatesStackScreen },
  { name: "PortalAccess", title: "Portal Access", icon: "Pa", group: "Communication & Portal", feature: "users", Component: PortalAccessStackScreen },
  { name: "Leave", title: "Leave", icon: "Lv", group: "People & Access", feature: "leave", Component: LeaveStackScreen },
  { name: "Gate", title: "Gate Register", icon: "Gt", group: "People & Access", feature: "gate_register", Component: GateStackScreen },
  { name: "Communications", title: "Communication", icon: "Cm", group: "Communication & Portal", feature: "parent_communication", Component: CommunicationsStackScreen },
  { name: "Syllabus", title: "Syllabus & Lesson Plans", icon: "Sy", group: "Academics", feature: "syllabus", Component: SyllabusStackScreen },
  { name: "Payroll", title: "Payroll", icon: "Py", group: "Finance & Operations", feature: "payroll", Component: PayrollStackScreen },
  { name: "Reports", title: "Reports", icon: "Rp", group: "Reports & Administration", feature: "reports", Component: ReportsStackScreen },
  { name: "Settings", title: "Institution Settings", icon: "Se", group: "Reports & Administration", feature: "settings", Component: SettingsNavigator },
];

/**
 * Modules are ordered by their drawer group so the sectioned drawer renders
 * each heading once, in MODULE_GROUPS order, rather than interleaved.
 */
function byGroupOrder(a: { group: ModuleGroup; title: string }, b: { group: ModuleGroup; title: string }) {
  const ga = MODULE_GROUPS.indexOf(a.group);
  const gb = MODULE_GROUPS.indexOf(b.group);
  return ga === gb ? a.title.localeCompare(b.title) : ga - gb;
}

export default function StaffNavigator() {
  const { user } = useAuth();
  const canSee = (feature: string) => hasAccess(user?.permissions, feature, "view");

  // Built once per permission set: createModuleStack returns a fresh component
  // type each call, so rebuilding on every render would remount every stack and
  // throw away the user's place in it.
  const screens = useMemo(() => {
    const modules = staffModules
      .filter((m: ModuleConfig) => canSee(m.feature))
      .map((m: ModuleConfig) => ({
        key: m.key,
        title: m.title,
        icon: m.icon,
        group: m.group,
        Component: createModuleStack(m),
      }));

    const bespoke = BESPOKE.filter((b) => canSee(b.feature)).map((b) => ({
      key: b.name,
      title: b.title,
      icon: b.icon,
      group: b.group,
      Component: b.Component,
    }));

    return [...bespoke, ...modules].sort(byGroupOrder);
  }, [user?.permissions]);

  // A drawer with no children throws ("Couldn't find any screens for the
  // navigator"), which is what a staff account whose role grants nothing used
  // to hit — a blank crash instead of an explanation.
  if (screens.length === 0) return <NoAccessScreen />;

  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: "front",
        drawerStyle: { width: 312 },
      }}
    >
      {screens.map(({ key, title, icon, group, Component }) => (
        <Drawer.Screen
          key={key}
          name={key}
          component={Component}
          options={{ drawerLabel: title, drawerIcon: icon, drawerGroup: group } as any}
        />
      ))}
    </Drawer.Navigator>
  );
}
