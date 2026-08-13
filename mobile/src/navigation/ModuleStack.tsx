import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ModuleConfig } from "../modules/types";
import ModuleListScreen from "../screens/generic/ModuleListScreen";
import ModuleDetailScreen from "../screens/generic/ModuleDetailScreen";
import ModuleFormScreen from "../screens/generic/ModuleFormScreen";
import { colors } from "../theme/theme";

export function createModuleStack(config: ModuleConfig) {
  const Stack = createNativeStackNavigator();

  return function ModuleStackNavigator() {
    return (
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
        }}
      >
        <Stack.Screen
          name={`${config.key}List`}
          options={{ title: config.title }}
        >
          {(props) => <ModuleListScreen {...props} config={config} />}
        </Stack.Screen>
        <Stack.Screen name={`${config.key}Detail`} options={{ title: config.title.replace(/s$/, "") }}>
          {(props) => <ModuleDetailScreen {...props} config={config} />}
        </Stack.Screen>
        <Stack.Screen
          name={`${config.key}Form`}
          options={({ route }: any) => ({ title: route.params?.id ? "Edit" : `New ${config.title.replace(/s$/, "")}` })}
        >
          {(props) => <ModuleFormScreen {...props} config={config} />}
        </Stack.Screen>
      </Stack.Navigator>
    );
  };
}
