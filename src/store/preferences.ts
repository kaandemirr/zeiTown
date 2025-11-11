import { create } from "zustand";

import { LANGUAGE_STORAGE_KEY, detectInitialLanguage } from "../i18n/config";
import type { SupportedLanguage } from "../i18n/config";

type ThemeMode = "dark" | "light";

interface PreferencesState {
  language: SupportedLanguage;
  theme: ThemeMode;
  setLanguage: (language: SupportedLanguage) => void;
  setTheme: (theme: ThemeMode) => void;
}

const persistLanguage = (language: SupportedLanguage) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  language: detectInitialLanguage(),
  theme: "dark",
  setLanguage: (language) =>
    set(() => {
      persistLanguage(language);
      return { language };
    }),
  setTheme: (theme) => set(() => ({ theme })),
}));
