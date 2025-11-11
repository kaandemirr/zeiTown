import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { LanguageSwitcher } from "./LanguageSwitcher";
import { useGameStore } from "../store/game";
import { playSound } from "../lib/sound";

const gradientBackdrop = `
  radial-gradient(circle at 20% 20%, rgba(43,108,238,0.35), transparent 55%),
  radial-gradient(circle at 80% 0%, rgba(255,255,255,0.08), transparent 45%),
  linear-gradient(135deg, rgba(16,22,34,0.95), rgba(10,12,18,0.9))
`;

export const StartScreen = () => {
  const { t } = useTranslation();
  const updatePhase = useGameStore((state) => state.updatePhase);
  const [showHowTo, setShowHowTo] = useState(false);

  const cardBackground = useMemo(
    () => ({
      backgroundImage: gradientBackdrop,
    }),
    [],
  );

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-background-dark text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(43,108,238,0.12),_transparent_60%)]" />
        <div className="absolute -left-32 top-24 h-72 w-72 rounded-[999px] bg-primary/20 blur-[120px]" />
        <div className="absolute -right-20 bottom-12 h-48 w-48 rounded-[999px] bg-violet-500/20 blur-[120px]" />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        <header className="flex items-center justify-between px-6 py-4 md:px-12">
          <div className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-slate-400">
            <span>ZeiTown</span>
            <span className="text-[0.65rem] tracking-[0.4em] text-slate-500">
              Village Edition
            </span>
          </div>
          <LanguageSwitcher />
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8 md:px-10 lg:px-20">
          <div className="layout-content-container flex w-full max-w-5xl flex-col">
            <div className="@container">
              <div className="@[480px]:p-4">
                <section
                  className="relative flex min-h-[480px] flex-col items-center justify-center gap-6 rounded-2xl border border-white/5 p-6 text-center shadow-2xl shadow-black/40 @[480px]:gap-8 @[480px]:p-10"
                  style={cardBackground}
                  aria-label="ZeiTown launch panel"
                >
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-300">
                      {t("villageTheme")}
                    </p>
                    <h1 className="text-4xl font-black leading-tight tracking-tight text-white @[480px]:text-6xl">
                      {t("heroTitle")}
                    </h1>
                    <p className="max-w-xl text-sm text-slate-200 @[480px]:text-base">
                      {t("heroSubtitle")}
                    </p>
                  </div>

                  <div className="flex max-w-xs w-full flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        playSound("ui");
                        updatePhase("setup");
                      }}
                      className="flex h-12 min-w-[84px] w-full items-center justify-center rounded-lg bg-primary text-base font-bold tracking-wide text-white transition-colors hover:bg-primary/90"
                    >
                      {t("startGame")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playSound("ui");
                        setShowHowTo((prev) => !prev);
                      }}
                      className="flex h-12 min-w-[84px] w-full items-center justify-center rounded-lg bg-white/5 text-base font-bold tracking-wide text-slate-200 transition-colors hover:bg-white/10"
                    >
                      {t("howToPlay")}
                    </button>
                  </div>
                  {showHowTo && (
                    <div className="max-w-2xl rounded-2xl border border-white/10 bg-black/30 p-4 text-left text-sm text-slate-200">
                      <p className="font-semibold uppercase tracking-[0.3em] text-xs text-primary">
                        {t("howToPlay")}
                      </p>
                      <p className="mt-2">{t("howToIntro")}</p>
                      <p className="mt-2 whitespace-pre-line text-slate-300">{t("howToBody")}</p>
                    </div>
                  )}

                  <div className="flex flex-col items-center gap-1 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[0.7rem] uppercase tracking-[0.4em] text-slate-200">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      {t("offlineBadge")}
                    </span>
                    <span className="text-slate-400">{t("comingSoon")}</span>
                  </div>
                </section>
              </div>
            </div>

            <footer className="flex flex-col items-center gap-4 px-4 py-10 text-center text-sm text-slate-400 @[480px]:flex-row @[480px]:justify-between">
              <p className="text-xs text-slate-500">{t("version")}</p>
              <div className="flex flex-col gap-1 text-xs text-slate-500 @[480px]:items-end">
                <span>{t("rightsReserved")}</span>
                <span>{t("licenseNotice")}</span>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
};
