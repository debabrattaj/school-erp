import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { translations, RTL_LANGUAGES } from "./translations";

const I18nContext = createContext(null);
const STORAGE_KEY = "school_erp_lang";

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(STORAGE_KEY) || "en");

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGUAGES.includes(lang) ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((next) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  // Translate: returns the language string for `key`, falling back to English
  // (the key itself) when a translation is missing.
  const t = useCallback(
    (key) => (translations[lang] && translations[lang][key]) || key,
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext) || { lang: "en", setLang: () => {}, t: (k) => k };
}

export function useT() {
  return useI18n().t;
}
