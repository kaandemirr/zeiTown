import { SUPPORTED_LANGUAGES } from "../i18n/config";
import type { SupportedLanguage } from "../i18n/config";
import { usePreferencesStore } from "../store/preferences";

const LabelMap: Record<SupportedLanguage, string> = {
  en: "EN",
  tr: "TR",
};

export const LanguageSwitcher = () => {
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);

  return (
    <div className="flex items-center gap-1 rounded-full bg-white/10 p-1 text-xs font-semibold shadow-lg shadow-black/30 backdrop-blur">
      {SUPPORTED_LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={language === code}
          onClick={() => setLanguage(code)}
          className={`rounded-full px-3 py-1 transition-colors ${
            language === code
              ? "bg-primary text-white"
              : "text-slate-300 hover:text-white"
          }`}
        >
          {LabelMap[code]}
        </button>
      ))}
    </div>
  );
};
