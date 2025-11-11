import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./i18n/config";
import "./index.css";
import { useGameStore } from "./store/game";
import { BOARD_TILES, BOARD_AREAS } from "./data/board";

if (import.meta.env.DEV && typeof window !== "undefined") {
  // expose store helpers for debugging in dev
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.__gameStore = {
    getState: () => useGameStore.getState(),
    roll: () => useGameStore.getState().rollDiceAndResolve(),
    rollN: (n: number) => {
      for (let i = 0; i < n; i += 1) {
        useGameStore.getState().rollDiceAndResolve();
      }
    },
    rollFixed: (a: number, b: number) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - dev helper
      return useGameStore.getState().rollDiceAndResolveFixed?.(a, b);
    },
    leaveJailByPayment: (id: string) => useGameStore.getState().leaveJailByPayment(id),
    useJailCard: (id: string) => useGameStore.getState().useJailCard(id),
    snapshot: () => {
      const s = useGameStore.getState();
      return {
        players: s.players.map((p) => ({ id: p.id, name: p.name, pos: p.position, funds: p.funds, inJail: p.inJail, jailTurns: p.jailTurns })),
        currentTurnIndex: s.currentTurnIndex,
        lastRoll: s.lastRoll,
        lastMovementPath: s.lastMovementPath,
        logs: s.logs,
      };
    },
    // expose board tile definitions for debugging
    boardTiles: BOARD_TILES,
    // expose board area mapping for debugging (areas correspond to grid slots)
    boardAreas: BOARD_AREAS,
  };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
