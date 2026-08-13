import React from "react";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";
import DashboardScreen from "../screens/dashboard/DashboardScreen";
import AttendanceScreen from "../screens/attendance/AttendanceScreen";
import MarksScreen from "../screens/marks/MarksScreen";
import { staffModules } from "../modules/configs";
import { createModuleStack } from "./ModuleStack";
import { useAuth } from "../auth/AuthContext";
import { hasAccess } from "../auth/types";
import { colors, spacing } from "../theme/theme";
import LogoutButton from "./LogoutButton";

const Drawer = createDrawerNavigator();
const AttendanceStack = createNativeStackNavigator();
const MarksStack = createNativeStackNavigator();

function AttendanceStackScreen() {
  return (
    <AttendanceStack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
      <AttendanceStack.Screen name="AttendanceHome" component={AttendanceScreen} options={{ title: "Attendance", headerRight: () => <LogoutButton /> }} />
    </AttendanceStack.Navigator>
  );
}

function MarksStackScreen() {
  return (
    <MarksStack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
      <MarksStack.Screen name="MarksHome" component={MarksScreen} options={{ title: "Marks", headerRight: () => <LogoutButton /> }} />
    </MarksStack.Navigator>
  );
}

const DashboardStack = createNativeStackNavigator();
function DashboardStackScreen() {
  return (
    <DashboardStack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
      <DashboardStack.Screen name="DashboardHome" component={DashboardScreen} options={{ title: "Dashboard", headerRight: () => <LogoutButton /> }} />
    </DashboardStack.Navigator>
  );
}

function DrawerLabel({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.labelText}>{title}</Text>
    </View>
  );
}

export default function StaffNavigator() {
  const { user } = useAuth();
  const canSee = (feature: string) => hasAccess(user?.permissions, feature, "view");

  const moduleStacks = staffModules
    .filter((m) => canSee(m.feature))
    .map((m) => ({ config: m, Component: createModuleStack(m) }));

  return (
    <Drawer.Navigator screenOptions={{ headerShown: false, drawerActiveTintColor: colors.primary }}>
      {canSee("dashboard") && (
        <Drawer.Screen
          name="Dashboard"
          component={DashboardStackScreen}
          options={{ drawerLabel: () => <DrawerLabel icon="📊" title="Dashboard" /> }}
        />
      )}
      {canSee("attendance") && (
        <Drawer.Screen
          name="Attendance"
          component={AttendanceStackScreen}
          options={{ drawerLabel: () => <DrawerLabel icon="🗓️" title="Attendance" /> }}
        />
      )}
      {canSee("marks") && (
        <Drawer.Screen
          name="Marks"
          component={MarksStackScreen}
          options={{ drawerLabel: () => <DrawerLabel icon="📈" title="Marks" /> }}
        />
      )}
      {moduleStacks.map(({ config, Component }) => (
        <Drawer.Screen
          key={config.key}
          name={config.key}
          component={Component}
          options={{ drawerLabel: () => <DrawerLabel icon={config.icon} title={config.title} /> }}
        />
      ))}
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing(1) },
  icon: { fontSize: 18, marginRight: spacing(3) },
  labelText: { fontSize: 15, fontWeight: "600", color: colors.text },
});
