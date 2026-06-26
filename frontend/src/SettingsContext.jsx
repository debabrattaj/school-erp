import { createContext, useContext, useEffect, useState } from "react";
import API from "./api";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  async function loadSettings() {
    try {
      setSettingsLoading(true);
      const response = await API.get("/settings/");
      setSettings(response.data);
    } catch (error) {
      console.error("Unable to load settings", error);
    } finally {
      setSettingsLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        settingsLoading,
        loadSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSchoolSettings() {
  return useContext(SettingsContext);
}