import React from "react";
import { createDrawerNavigator, DrawerToggleButton } from "@react-navigation/drawer";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import DashboardScreen from "../screens/dashboard/DashboardScreen";
import AttendanceScreen from "../screens/attendance/AttendanceScreen";
import MarksScreen from "../screens/marks/MarksScreen";
import { staffModules } from "../modules/configs";
import { MODULE_GROUPS, ModuleConfig } from "../modules/types";
import { createModuleStack } from "./ModuleStack";
import DrawerContent from "./DrawerContent";
import { useAuth } from "../auth/AuthContext";
import { hasAccess } from "../auth/types";
import { colors } from "../theme/theme";
import LogoutButton from "./LogoutButton";

const Drawer = createDrawerNavigator();
const AttendanceStack = createNativeStackNavigator();
const MarksStack = createNativeStackNavigator();

// The drawer itself renders no header, so each stack's own header has to carry
// the control that opens it — without this there is no way in but an edge
// swipe, which Android's gesture navigation swallows as "back".
const drawerButton = () => <DrawerToggleButton tintColor={colors.text} />;

function AttendanceStackScreen() {
  return (
    <AttendanceStack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
      <AttendanceStack.Screen name="AttendanceHome" component={AttendanceScreen} options={{ title: "Attendance", headerLeft: drawerButton, headerRight: () => <LogoutButton /> }} />
    </AttendanceStack.Navigator>
  );
}

function MarksStackScreen() {
  return (
    <MarksStack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
      <MarksStack.Screen name="MarksHome" component={MarksScreen} options={{ title: "Marks", headerLeft: drawerButton, headerRight: () => <LogoutButton /> }} />
    </MarksStack.Navigator>
  );
}

const DashboardStack = createNativeStackNavigator();
function DashboardStackScreen() {
  return (
    <DashboardStack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
      <DashboardStack.Screen name="DashboardHome" component={DashboardScreen} options={{ title: "Dashboard", headerLeft: drawerButton, headerRight: () => <LogoutButton /> }} />
    </DashboardStack.Navigator>
  );
}

/**
 * Modules are ordered by their drawer group so the sectioned drawer renders
 * each heading once, in MODULE_GROUPS order, rather than interleaved.
 */
function byGroupOrder(a: ModuleConfig, b: ModuleConfig) {
  const ga = MODULE_GROUPS.indexOf(a.group);
  const gb = MODULE_GROUPS.indexOf(b.group);
  return ga === gb ? a.title.localeCompare(b.title) : ga - gb;
}

export default function StaffNavigator() {
  const { user } = useAuth();
  const canSee = (feature: string) => hasAccess(user?.permissions, feature, "view");

  const moduleStacks = staffModules
    .filter((m) => canSee(m.feature))
    .slice()
    .sort(byGroupOrder)
    .map((m) => ({ config: m, Component: createModuleStack(m) }));

  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: "front",
        drawerStyle: { width: 312 },
      }}
    >
      {canSee("dashboard") && (
        <Drawer.Screen
          name="Dashboard"
          component={DashboardStackScreen}
          options={{ drawerLabel: "Dashboard", drawerIcon: "Db", drawerGroup: "Overview" } as any}
        />
      )}
      {canSee("attendance") && (
        <Drawer.Screen
          name="Attendance"
          component={AttendanceStackScreen}
          options={{ drawerLabel: "Attendance", drawerIcon: "At", drawerGroup: "Overview" } as any}
        />
      )}
      {canSee("marks") && (
        <Drawer.Screen
          name="Marks"
          component={MarksStackScreen}
          options={{ drawerLabel: "Marks", drawerIcon: "Mk", drawerGroup: "Overview" } as any}
        />
      )}
      {moduleStacks.map(({ config, Component }) => (
        <Drawer.Screen
          key={config.key}
          name={config.key}
          component={Component}
          options={
            {
              drawerLabel: config.title,
              drawerIcon: config.icon,
              drawerGroup: config.group,
            } as any
          }
        />
      ))}
    </Drawer.Navigator>
  );
}
