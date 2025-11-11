import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { PLAYER_COUNT_OPTIONS, TOKEN_OPTIONS } from "../constants/setup";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useGameStore } from "../store/game";
import { playSound } from "../lib/sound";

type PlayerForm = {
  name: string;
  tokenId: string;
};

const palette = ["#2b6cee", "#facc15", "#34d399", "#a78bfa", "#f97316", "#fb7185"];

const fallbackTokenId = TOKEN_OPTIONS[0]?.id ?? "tesla-coil";
const tokenOptionCount = TOKEN_OPTIONS.length || 1;

const createDefaultForm = (index: number): PlayerForm => {
  const defaultToken =
    TOKEN_OPTIONS[index % tokenOptionCount]?.id ?? fallbackTokenId;
  return {
    name: "",
    tokenId: defaultToken,
  };
};

const panelBackground = `
	  linear-gradient(rgba(16, 22, 34, 0.85) 0%, rgba(16, 22, 34, 0.95) 100%),
	  url("https://lh3.googleusercontent.com/aida-public/AB6AXuAh-3F86kBfQujpbu_FCDbcMb9e-JUOiNc2j71npLhSvyZABaHdKT3z4NLmY4r4LlxTaZ7mtqSkuac2axlE321IocyIVMIhB7wBaMLz_p3Fvc0FAiO_Od7PUIShOTilaWTCcNAqVQV6yhASifD11jwS1AbEyy716bKTeQ3Aoa-scqdhDGCsi0L0B2IHqut-UbtW_8ye4OcoS17BQelau3ZVWOq9vdciCETxZhQB0TVvdne9GUXIYpe03GneNO0mfyRA89TrIg80UiSg")
	`;

export const SetupScreen = () => {
  const { t } = useTranslation();

  const playerCount = useGameStore((state) => state.playerCount);
  const setPlayerCount = useGameStore((state) => state.setPlayerCount);
  const setPlayers = useGameStore((state) => state.setPlayers);
  const updatePhase = useGameStore((state) => state.updatePhase);

  const [playerForms, setPlayerForms] = useState<PlayerForm[]>(() =>
    Array.from({ length: playerCount }, (_, idx) => createDefaultForm(idx)),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setPlayerForms((prev) => {
      const next = [...prev];
      if (playerCount > prev.length) {
        for (let i = prev.length; i < playerCount; i += 1) {
          next.push(createDefaultForm(i));
        }
      } else if (playerCount < prev.length) {
        next.length = playerCount;
      }
      return next;
    });
  }, [playerCount]);

  const limitedForms = useMemo(
    () => playerForms.slice(0, playerCount),
    [playerForms, playerCount],
  );

  const handleContinue = () => {
    const hasEmptyName = limitedForms.some((form) => form.name.trim().length === 0);
    if (hasEmptyName) {
      setErrorMessage(t("nameRequired"));
      return;
    }
    setErrorMessage(null);

    const generatedPlayers = limitedForms.map((form, index) => ({
      id: `player-${index + 1}`,
      name: form.name.trim(),
      color: palette[index % palette.length],
      tokenId: form.tokenId,
    }));

    setPlayers(generatedPlayers);
    updatePhase("rolling");
  };

  const handleNameChange = (index: number, value: string) => {
    setPlayerForms((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name: value };
      return next;
    });
  };

  const handleTokenChange = (index: number, tokenId: string) => {
    setPlayerForms((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], tokenId };
      return next;
    });
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-background-dark text-white">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,_rgba(43,108,238,0.25),_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,_rgba(139,92,246,0.18),_transparent_45%)]" />
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
          <div className="flex w-full max-w-5xl flex-col">
            <section
              className="flex flex-col gap-8 rounded-2xl border border-white/5 p-6 @[480px]:p-10 shadow-2xl shadow-black/40"
              style={{ backgroundImage: panelBackground, backgroundSize: "cover" }}
            >
              <div className="flex flex-col gap-2 text-center">
                <h1 className="text-4xl font-black leading-tight tracking-tight @[480px]:text-5xl">
                  {t("setupTitle")}
                </h1>
                <p className="text-sm text-slate-200 @[480px]:text-base">
                  {t("setupSubtitle")}
                </p>
              </div>

	              <div className="flex flex-col gap-8">
	                <div className="flex flex-col gap-4 text-center">
	                  <h3 className="text-lg font-bold text-white">
	                    {t("playerCountLabel")}
	                  </h3>
	                  <div className="grid grid-cols-2 gap-3 @[480px]:grid-cols-3 @[768px]:grid-cols-5">
	                        {PLAYER_COUNT_OPTIONS.map((option) => {
	                      const isActive = option === playerCount;
	                      return (
	                        <button
	                          key={option}
	                          type="button"
	                          onClick={() => {
	                            playSound("ui");
	                            setPlayerCount(option);
	                          }}
	                          className={`flex h-12 min-w-[84px] items-center justify-center rounded-lg px-4 text-base font-bold tracking-wide transition-all ${
	                            isActive
	                              ? "bg-primary text-white ring-2 ring-primary/80"
	                              : "bg-white/5 text-slate-200 hover:bg-white/10"
	                          }`}
	                        >
	                          {t("playerCountOption", { count: option })}
	                        </button>
	                      );
	                    })}
	                  </div>
	                </div>

	                <div className="flex flex-col gap-4">
	                  <h3 className="text-center text-lg font-bold text-white">
	                    {t("characterSelectLabel")}
	                  </h3>
	                  <div className="grid gap-4">
	                    {limitedForms.map((form, index) => (
	                      <div
	                        key={`player-config-${index}`}
	                        className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur"
	                      >
	                        <div className="flex flex-col gap-2">
	                          <label
	                            className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-300"
	                            htmlFor={`player-name-${index}`}
	                          >
	                            {t("playerNameLabel", { index: index + 1 })}
	                          </label>
	                          <input
	                            id={`player-name-${index}`}
	                            type="text"
	                            value={form.name}
	                            onChange={(event) =>
	                              handleNameChange(index, event.target.value)
	                            }
	                            placeholder={t("playerLabel", { index: index + 1 })}
	                            className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-primary focus:outline-none"
	                            required
	                          />
	                        </div>

                        <div className="mt-4 flex flex-col gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            {t("tokenSelectLabel")}
                          </span>
                          <div className="grid grid-cols-2 gap-2 @[480px]:grid-cols-4">
                            {TOKEN_OPTIONS.map((token) => {
                              const isSelected = token.id === form.tokenId;
                              return (
                                <button
                                  key={`${token.id}-${index}`}
                                  type="button"
                                  onClick={() => {
                                    playSound("ui");
                                    handleTokenChange(index, token.id);
                                  }}
                                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center text-xs transition-colors ${
                                    isSelected
                                      ? "border-primary bg-white/10 text-white"
                                      : "border-white/10 text-slate-300 hover:border-white/30"
                                  }`}
                                >
                                  <img
                                    src={token.image}
                                    alt={t(token.labelKey)}
                                    className="h-10 w-10 object-contain"
                                  />
                                  <span className="text-[0.65rem] font-semibold">
                                    {t(token.labelKey)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
	                      </div>
	                    ))}
	                  </div>
	                </div>
	              </div>

	              {errorMessage && (
	                <p className="text-center text-sm font-semibold text-rose-300">
	                  {errorMessage}
	                </p>
	              )}

              <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:justify-center">
	                <button
	                  type="button"
	                  onClick={() => {
	                    playSound("ui");
	                    handleContinue();
	                  }}
	                  className="flex h-12 min-w-[160px] flex-1 items-center justify-center rounded-lg bg-primary text-base font-bold tracking-wide text-white transition-colors hover:bg-primary/90"
	                >
	                  {t("continue")}
	                </button>
	                <button
	                  type="button"
	                  onClick={() => {
	                    playSound("ui");
	                    updatePhase("lobby");
	                  }}
	                  className="flex h-12 min-w-[160px] flex-1 items-center justify-center rounded-lg border border-white/10 bg-transparent text-base font-bold tracking-wide text-slate-200 transition-colors hover:bg-white/10"
	                >
                  {t("back")}
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};
