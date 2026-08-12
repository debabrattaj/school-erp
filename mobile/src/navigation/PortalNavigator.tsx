import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ChildrenScreen from "../screens/portal/ChildrenScreen";
import ChildDetailScreen from "../screens/portal/ChildDetailScreen";
import { colors } from "../theme/theme";
import LogoutButton from "./LogoutButton";

const Stack = createNativeStackNavigator();

export default function PortalNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
      <Stack.Screen
        name="Children"
        component={ChildrenScreen}
        options={{ title: "My Children", headerRight: () => <LogoutButton /> }}
      />
      <Stack.Screen
        name="ChildDetail"
        component={ChildDetailScreen}
        options={({ route }: any) => ({ title: route.params?.name || "Student" })}
      />
    </Stack.Navigator>
  );
}
