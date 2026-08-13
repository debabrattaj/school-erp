import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { isPortalRole } from "../auth/types";
import { LoadingView } from "../components/Common";
import LoginScreen from "../screens/LoginScreen";
import StaffNavigator from "./StaffNavigator";
import PortalNavigator from "./PortalNavigator";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingView />;

  return (
    <NavigationContainer>
      {!user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      ) : isPortalRole(user.role) ? (
        <PortalNavigator />
      ) : (
        <StaffNavigator />
      )}
    </NavigationContainer>
  );
}
