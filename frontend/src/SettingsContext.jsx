import { createContext, useContext, useEffect, useState } from "react";
import API from "./api";
import { getUser } from "./auth";

const SettingsContext = createContext(null);

// GET /settings/ is gated server-side to Admin/Principal/Accounts/Teacher --
// Parent and Student never have access (see backend/app/permissions.py),
// so skip the request for them entirely rather than firing it and eating a
// 403 on every single page load in the portal.
const SETTINGS_BLOCKED_ROLES = ["Parent", "Student"];

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(
    () => !SETTINGS_BLOCKED_ROLES.includes(getUser()?.role)
  );

  async function loadSettings() {
    if (SETTINGS_BLOCKED_ROLES.includes(getUser()?.role)) {
      setSettingsLoading(false);
      return;
    }

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