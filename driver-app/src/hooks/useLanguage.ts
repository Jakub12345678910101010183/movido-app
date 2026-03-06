/**
 * Language hook — persists driver's language preference
 */

import { useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { setLanguage, getLanguage, t, LANGUAGES, type Language } from "../lib/i18n";

const LANG_KEY = "movido-language";

export function useLanguage() {
  const [lang, setLang] = useState<Language>(getLanguage());

  // Load saved language on mount
  useEffect(() => {
    SecureStore.getItemAsync(LANG_KEY).then((saved) => {
      if (saved && (saved === "en" || saved === "pl" || saved === "ro")) {
        setLanguage(saved as Language);
        setLang(saved as Language);
      }
    });
  }, []);

  const changeLanguage = useCallback(async (newLang: Language) => {
    setLanguage(newLang);
    setLang(newLang);
    await SecureStore.setItemAsync(LANG_KEY, newLang);
  }, []);

  return { lang, changeLanguage, t, LANGUAGES };
}
