import React from "react";
import { DrawerToggleButton } from "@react-navigation/drawer";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SettingsScreen from "../screens/settings/SettingsScreen";
import BiometricScreen from "../screens/biometric/BiometricScreen";
import { colors } from "../theme/theme";

const Stack = createNativeStackNavigator();

export default function SettingsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
      <Stack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ title: "Institution Settings", headerLeft: () => <DrawerToggleButton tintColor={colors.text} /> }}
      />
      <Stack.Screen name="BiometricHome" component={BiometricScreen} options={{ title: "Biometric Attendance" }} />
    </Stack.Navigator>
  );
}
