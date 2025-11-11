import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { StartScreen } from "./components/StartScreen";
import { SetupScreen } from "./components/SetupScreen";
import { GameBoard } from "./components/GameBoard";
import { usePreferencesStore } from "./store/preferences";
import { useGameStore } from "./store/game";

const App = () => {
  const { i18n } = useTranslation();
  const language = usePreferencesStore((state) => state.language);
  const phase = useGameStore((state) => state.phase);

  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [i18n, language]);

  switch (phase) {
    case "lobby":
      return <StartScreen />;
    case "setup":
      return <SetupScreen />;
    case "rolling":
    case "trading":
    case "summary":
    default:
      return <GameBoard />;
  }
};

export default App;
