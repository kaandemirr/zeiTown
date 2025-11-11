import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { TOKEN_OPTIONS, getTokenDefinition } from "../constants/setup";
import {
  BOARD_AREAS,
  BOARD_TILES,
  type TileDefinition,
  type TileType,
} from "../data/board";
import { useGameStore, type PropertyState } from "../store/game";
import { playSound } from "../lib/sound";

const boardTemplate = `
  "corner-tl prop-t1 prop-t2 prop-t3 prop-t4 prop-t5 prop-t6 prop-t7 prop-t8 prop-t9 corner-tr"
  "prop-l9 center center center center center center center center center prop-r1"
  "prop-l8 center center center center center center center center center prop-r2"
  "prop-l7 center center center center center center center center center prop-r3"
  "prop-l6 center center center center center center center center center prop-r4"
  "prop-l5 center center center center center center center center center prop-r5"
  "prop-l4 center center center center center center center center center prop-r6"
  "prop-l3 center center center center center center center center center prop-r7"
  "prop-l2 center center center center center center center center center prop-r8"
  "prop-l1 center center center center center center center center center prop-r9"
  "corner-bl prop-b9 prop-b8 prop-b7 prop-b6 prop-b5 prop-b4 prop-b3 prop-b2 prop-b1 corner-br"
`;

const MAX_UPGRADE_LEVEL = 5;

const tileBaseClass =
  "property-card relative rounded-md border border-white/5 bg-slate-900/80 text-[0.6rem] font-semibold uppercase tracking-tight text-slate-100";

const defaultTokenImage = TOKEN_OPTIONS[0]?.image ?? "";

const currencyFormatter = (symbol: string, amount: number) =>
  `${symbol} ${amount.toLocaleString()}`;

const tileIconDefaults: Record<TileType, string> = {
  start: "redo",
  property: "home",
  railway: "train",
  utility: "bolt",
  chance: "help",
  chest: "inventory_2",
  tax: "payments",
  parking: "local_parking",
  jail: "gavel",
  gotojail: "front_hand",
};

type Orientation = "top" | "bottom" | "left" | "right" | "corner";

const getOrientation = (area: string): Orientation => {
  if (area.startsWith("prop-b")) return "bottom";
  if (area.startsWith("prop-t")) return "top";
  if (area.startsWith("prop-l")) return "left";
  if (area.startsWith("prop-r")) return "right";
  return "corner";
};

const GROUP_PRIORITY: Record<string, number> = {
  brown: 0,
  lightBlue: 1,
  magenta: 2,
  orange: 3,
  red: 4,
  yellow: 5,
  green: 6,
  navy: 7,
  rail: 8,
  utility: 9,
};

const sortHoldings = (tiles: TileDefinition[]) =>
  [...tiles].sort((a, b) => {
    const priorityA = a.group ? GROUP_PRIORITY[a.group] ?? 50 : 60;
    const priorityB = b.group ? GROUP_PRIORITY[b.group] ?? 50 : 60;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.name.localeCompare(b.name);
  });

const ownsGroup = (
  playerId: string,
  tile: TileDefinition | null,
  propertyState: Record<string, PropertyState>,
) => {
  if (!playerId || !tile?.group) return false;
  return BOARD_TILES.filter((candidate) => candidate.group === tile.group && candidate.id).every(
    (candidate) => {
      if (!candidate.id) return false;
      return propertyState[candidate.id]?.ownerId === playerId;
    },
  );
};

const determineUpgradeCost = (tile: TileDefinition | null, nextLevel: number) => {
  if (!tile?.houseCost) return 0;
  if (nextLevel <= 4) return tile.houseCost;
  return tile.houseCost * 2;
};

const getRentPreview = (
  tile: TileDefinition | null,
  propertyState: Record<string, PropertyState>,
  currency: string,
) => {
  if (!tile) return "-";
  if (!tile.id || !propertyState[tile.id]) {
    return tile.rent ? currencyFormatter(currency, tile.rent) : "-";
  }

  const meta = propertyState[tile.id];
  if (!meta) return tile.rent ? currencyFormatter(currency, tile.rent) : "-";

  if (meta.houses > 0 && tile.rentLevels?.length) {
    const levelIndex = Math.min(meta.houses, tile.rentLevels.length) - 1;
    const rent = tile.rentLevels[levelIndex] ?? tile.rent ?? 0;
    return currencyFormatter(currency, rent);
  }

  if (ownsGroup(meta.ownerId ?? "", tile, propertyState) && tile.rent) {
    return currencyFormatter(currency, tile.rent * 2);
  }

  return tile.rent ? currencyFormatter(currency, tile.rent) : "-";
};

export const GameBoard = () => {
  const { t } = useTranslation();

  const players = useGameStore((state) => state.players);
  const propertyState = useGameStore((state) => state.propertyState);
  const currentTurnIndex = useGameStore((state) => state.currentTurnIndex);
  const lastRoll = useGameStore((state) => state.lastRoll);
  const rollDiceAndResolve = useGameStore((state) => state.rollDiceAndResolve);
  const updatePhase = useGameStore((state) => state.updatePhase);
  const logs = useGameStore((state) => state.logs);
  const lastCard = useGameStore((state) => state.lastCard);
  const dismissCard = useGameStore((state) => state.dismissCard);
  const pendingAction = useGameStore((state) => state.pendingAction);
  const confirmPurchase = useGameStore((state) => state.confirmPurchase);
  const declinePurchase = useGameStore((state) => state.declinePurchase);
  const confirmUpgrade = useGameStore((state) => state.confirmUpgrade);
  const declineUpgrade = useGameStore((state) => state.declineUpgrade);
  const requestUpgrade = useGameStore((state) => state.requestUpgrade);
  const mortgageProperty = useGameStore((state) => state.mortgageProperty);
  const redeemProperty = useGameStore((state) => state.redeemProperty);
  const leaveJailByPayment = useGameStore((state) => state.leaveJailByPayment);
  const useJailCard = useGameStore((state) => state.useJailCard);
  const claimPledgeFrom = useGameStore((state) => state.claimPledgeFrom);
  const pendingTrade = useGameStore((state) => state.pendingTrade);
  const sendTradeProposal = useGameStore((state) => state.sendTradeProposal);
  const acceptTradeProposal = useGameStore((state) => state.acceptTradeProposal);
  const rejectTradeProposal = useGameStore((state) => state.rejectTradeProposal);
  const lastMovementPath = useGameStore((state) => state.lastMovementPath);
  const winnerId = useGameStore((state) => state.winnerId);

  const currency = t("currencySymbol");
  const [dieA, dieB] = lastRoll;
  const activePlayer =
    players.length > 0 ? players[currentTurnIndex % Math.max(players.length, 1)] : undefined;
  const activeTile = activePlayer ? BOARD_TILES[activePlayer.position] ?? null : null;
  const activePropertyMeta = activeTile?.id ? propertyState[activeTile.id] : undefined;
  const tileOwner = activePropertyMeta?.ownerId
    ? players.find((player) => player.id === activePropertyMeta.ownerId)
    : undefined;

  const rentPreview = getRentPreview(activeTile ?? null, propertyState, currency);
  const movementSet = useMemo(() => new Set(lastMovementPath), [lastMovementPath]);
  const finalMovementIndex = lastMovementPath.length > 0 ? lastMovementPath[lastMovementPath.length - 1] : null;

  const playersByArea = useMemo(() => {
    const mapping: Record<string, typeof players> = {};
    players.forEach((player) => {
      const index =
        ((player.position % BOARD_AREAS.length) + BOARD_AREAS.length) %
        BOARD_AREAS.length;
      const areaKey = BOARD_AREAS[index];
      if (!areaKey) return;
      if (!mapping[areaKey]) {
        mapping[areaKey] = [];
      }
      mapping[areaKey].push(player);
    });
    return mapping;
  }, [players]);

  const pendingTile = useMemo(() => {
    if (!pendingAction || !pendingAction.tileId) return null;
    return BOARD_TILES.find((tile) => tile.id === pendingAction.tileId) ?? null;
  }, [pendingAction]);

  const pendingPlayer = useMemo(() => {
    if (!pendingAction) return null;
    return players.find((player) => player.id === pendingAction.playerId) ?? null;
  }, [pendingAction, players]);

  const rollDisabled = Boolean(pendingAction);
  const tradeModalVisible =
    Boolean(pendingTrade) && Boolean(activePlayer) && pendingTrade?.toId === activePlayer?.id;

  const ownershipMap = useMemo(() => {
    const map: Record<string, TileDefinition[]> = {};
    BOARD_TILES.forEach((tile) => {
      if (!tile.id) return;
      const meta = propertyState[tile.id];
      if (meta?.ownerId) {
        if (!map[meta.ownerId]) {
          map[meta.ownerId] = [];
        }
        map[meta.ownerId].push(tile);
      }
    });
    return map;
  }, [propertyState]);


  const areaTiles = BOARD_AREAS.map((area, index) => ({
    area,
    tile: BOARD_TILES[index],
    index,
  }));

  if (players.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background-dark px-4 text-white">
        <div className="max-w-md rounded-2xl border border-white/5 bg-white/5 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur">
          <p className="text-lg font-semibold">
            ZeiTown board requires players. Please configure a match first.
          </p>
          <button
            type="button"
            onClick={() => updatePhase("setup")}
            className="mt-6 inline-flex h-12 items-center justify-center rounded-lg bg-primary px-6 text-base font-bold text-white transition-colors hover:bg-primary/90"
          >
            {t("continue")}
          </button>
        </div>
      </div>
    );
  }

  const recentLogs = useMemo(() => {
    const slice = logs.slice(-4);
    return [...slice].reverse();
  }, [logs]);
  const logFallback = logs.length === 0 ? t("logEmpty") : null;

  const [tradeFrom, setTradeFrom] = useState("");
  const [tradeTo, setTradeTo] = useState("");
  const [offerGiveCash, setOfferGiveCash] = useState("0");
  const [offerReceiveCash, setOfferReceiveCash] = useState("0");
  const [offerGiveTiles, setOfferGiveTiles] = useState<string[]>([]);
  const [offerReceiveTiles, setOfferReceiveTiles] = useState<string[]>([]);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [pledgeTarget, setPledgeTarget] = useState("");
  const [pledgeTile, setPledgeTile] = useState<string | null>(null);
  const rollingTimeout = useRef<number | null>(null);
  const isRollingRef = useRef(false);
  const prevPlayersRef = useRef(players);
  const [eliminationNotice, setEliminationNotice] = useState<string[] | null>(null);
  const [winnerNotice, setWinnerNotice] = useState<string | null>(null);

  useEffect(() => {
    if (players.length === 0) {
      setTradeFrom("");
      setTradeTo("");
      return;
    }

    setTradeFrom((prev) => {
      if (prev && players.some((player) => player.id === prev)) {
        return prev;
      }
      return players[0].id;
    });

    setTradeTo((prev) => {
      if (prev && players.some((player) => player.id === prev) && prev !== tradeFrom) {
        return prev;
      }
      const fallback =
        players.find((player) => player.id !== tradeFrom && player.id !== prev)?.id ?? "";
      return fallback;
    });
  }, [players, tradeFrom]);
  useEffect(() => {
    setOfferGiveTiles([]);
    setOfferGiveCash("0");
  }, [tradeFrom]);

  useEffect(() => {
    setOfferReceiveTiles([]);
    setOfferReceiveCash("0");
  }, [tradeTo]);

  useEffect(() => {
    if (!pendingTrade) {
      setTradeSuccess(null);
    }
  }, [pendingTrade]);

  useEffect(() => {
    return () => {
      if (rollingTimeout.current) {
        window.clearTimeout(rollingTimeout.current);
      }
      isRollingRef.current = false;
    };
  }, [t]);

  useEffect(() => {
    const prev = prevPlayersRef.current;
    if (prev !== players) {
      const eliminated = prev.filter(
        (prevPlayer) => !players.some((player) => player.id === prevPlayer.id),
      );
      if (eliminated.length > 0) {
        setEliminationNotice(eliminated.map((player) => player.name));
      }
      prevPlayersRef.current = players;
    }
  }, [players]);

  useEffect(() => {
    if (!winnerId) {
      setWinnerNotice(null);
      return;
    }
    const winner = players.find((player) => player.id === winnerId);
    setWinnerNotice(winner?.name ?? null);
  }, [winnerId, players]);

  const tradeFromTiles = useMemo(() => {
    if (!tradeFrom) return [];
    const tiles = ownershipMap[tradeFrom] ?? [];
    return sortHoldings(tiles);
  }, [ownershipMap, tradeFrom]);

  const tradeToTiles = useMemo(() => {
    if (!tradeTo) return [];
    const tiles = ownershipMap[tradeTo] ?? [];
    return sortHoldings(tiles);
  }, [ownershipMap, tradeTo]);

  useEffect(() => {
    setOfferGiveTiles((prev) =>
      prev.filter((tileId) => tradeFromTiles.some((tile) => tile.id === tileId)),
    );
  }, [tradeFromTiles]);

  useEffect(() => {
    setOfferReceiveTiles((prev) =>
      prev.filter((tileId) => tradeToTiles.some((tile) => tile.id === tileId)),
    );
  }, [tradeToTiles]);

  const handleRoll = () => {
    if (rollDisabled) return;
    setIsRolling(true);
    playSound("dice");
    rollDiceAndResolve();
    if (rollingTimeout.current) {
      window.clearTimeout(rollingTimeout.current);
    }
    rollingTimeout.current = window.setTimeout(() => {
      setIsRolling(false);
    }, 900);
  };

  const tileNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    BOARD_TILES.forEach((tile) => {
      if (tile.id) {
        map[tile.id] = t(`tiles.${tile.id}`, { defaultValue: tile.name });
      }
    });
    return map;
  }, [t]);

  const tileLabel = (tile?: TileDefinition | null) => {
    if (!tile) return "";
    if (tile.id) return t(`tiles.${tile.id}`, { defaultValue: tile.name });
    return tile.name ?? "";
  };

  const tradeFromPlayer = players.find((player) => player.id === tradeFrom) ?? null;
  const tradeToPlayer = players.find((player) => player.id === tradeTo) ?? null;
  const pendingTradeInfo = useMemo(() => {
    if (!pendingTrade) return null;
    const fromPlayer = players.find((player) => player.id === pendingTrade.fromId) ?? null;
    const toPlayer = players.find((player) => player.id === pendingTrade.toId) ?? null;
    return { trade: pendingTrade, fromPlayer, toPlayer };
  }, [pendingTrade, players]);

  const renderTradeItems = (cash: number, tileIds: string[]): ReactNode[] => {
    const entries: ReactNode[] = [];
    if (cash > 0) {
      entries.push(
        <li key="cash" className="text-sm font-semibold text-white">
          {currencyFormatter(currency, cash)}
        </li>,
      );
    }
    tileIds.forEach((tileId) => {
      entries.push(
        <li key={tileId} className="text-sm text-slate-100">
          {tileNameMap[tileId] ?? tileId}
        </li>,
      );
    });
    if (entries.length === 0) {
      entries.push(
        <li key="none" className="text-xs text-slate-400">
          {t("tradeNoItems")}
        </li>,
      );
    }
    return entries;
  };

  const toggleGiveTile = (tileId: string) => {
    setOfferGiveTiles((prev) =>
      prev.includes(tileId) ? prev.filter((id) => id !== tileId) : [...prev, tileId],
    );
  };

  const toggleReceiveTile = (tileId: string) => {
    setOfferReceiveTiles((prev) =>
      prev.includes(tileId) ? prev.filter((id) => id !== tileId) : [...prev, tileId],
    );
  };

  const handleSendTrade = () => {
    setTradeSuccess(null);
    setTradeError(null);
    if (!tradeFrom || !tradeTo || tradeFrom === tradeTo) {
      setTradeError(t("tradeSelectDifferent"));
      return;
    }
    if (pendingTrade) {
      setTradeError(t("tradePendingOfferExists"));
      return;
    }
    const fromPlayer = players.find((player) => player.id === tradeFrom);
    const toPlayer = players.find((player) => player.id === tradeTo);
    if (!fromPlayer || !toPlayer) {
      setTradeError(t("tradeOfferBlocked"));
      return;
    }
    const giveCashValue = Math.max(0, Math.floor(Number(offerGiveCash) || 0));
    const receiveCashValue = Math.max(0, Math.floor(Number(offerReceiveCash) || 0));
    if (
      giveCashValue === 0 &&
      receiveCashValue === 0 &&
      offerGiveTiles.length === 0 &&
      offerReceiveTiles.length === 0
    ) {
      setTradeError(t("tradeSelectValue"));
      return;
    }
    if (fromPlayer.funds < giveCashValue) {
      setTradeError(t("tradeInsufficientFunds"));
      return;
    }
    if (toPlayer.funds < receiveCashValue) {
      setTradeError(t("tradeInsufficientFundsTarget", { name: toPlayer.name }));
      return;
    }
    const invalidGive = offerGiveTiles.some((tileId) => propertyState[tileId]?.ownerId !== tradeFrom);
    const invalidReceive = offerReceiveTiles.some(
      (tileId) => propertyState[tileId]?.ownerId !== tradeTo,
    );
    if (invalidGive || invalidReceive) {
      setTradeError(t("tradeInvalidOwnership"));
      return;
    }

    const success = sendTradeProposal({
      fromId: tradeFrom,
      toId: tradeTo,
      giveCash: giveCashValue,
      receiveCash: receiveCashValue,
      giveTiles: offerGiveTiles,
      receiveTiles: offerReceiveTiles,
    });

    if (!success) {
      setTradeError(t("tradeOfferBlocked"));
      return;
    }

    setTradeSuccess(t("tradeOfferSent", { name: toPlayer.name }));
    setOfferGiveCash("0");
    setOfferReceiveCash("0");
    setOfferGiveTiles([]);
    setOfferReceiveTiles([]);
  };

  const renderTokenCluster = (area: string) => {
    const tokens = playersByArea[area];
    if (!tokens || tokens.length === 0) return null;
    return (
      <div className="pointer-events-none absolute bottom-1 right-1 flex items-center gap-0.5">
        {tokens.slice(0, 3).map((player) => {
          const tokenMeta = getTokenDefinition(player.tokenId);
          const labelKey = tokenMeta?.labelKey ?? "token.teslaCoil";
          return (
            <img
              key={player.id}
              src={tokenMeta?.image ?? defaultTokenImage}
              alt={t(labelKey)}
              className="h-7 w-7 rounded-full border-2 bg-slate-900/90 object-contain p-0.5 shadow-lg shadow-black/70"
              style={{ borderColor: player.color, boxShadow: `0 0 12px ${player.color}` }}
            />
          );
        })}
        {tokens.length > 3 && (
          <span className="text-[0.55rem] font-bold text-white/80">
            +{tokens.length - 3}
          </span>
        )}
      </div>
    );
  };

  const renderPropertyTile = (
    tile: TileDefinition,
    area: string,
    orientation: Orientation,
    boardIndex: number,
  ) => {
    if (!tile.color) {
      return null;
    }

    const isVertical =
      orientation === "top" || orientation === "bottom" || orientation === "corner";
    const colorStrip = (
      <div
        className={
          orientation === "left" || orientation === "right"
            ? "h-full w-2"
            : "h-2 w-full"
        }
        style={{ backgroundColor: tile.color }}
      />
    );

    const isFinal = finalMovementIndex === boardIndex;
    const isPassing = movementSet.has(boardIndex) && !isFinal;
    const highlight = isFinal
      ? "ring-2 ring-primary/70 shadow-[0_0_15px_rgba(43,108,238,0.6)] animate-pulse"
      : isPassing
      ? "ring-1 ring-primary/30 shadow-[0_0_6px_rgba(43,108,238,0.15)]"
      : "";

    return (
      <div
        key={tile.id}
        className={`${tileBaseClass} overflow-hidden ${highlight}`}
        style={{ gridArea: area }}
      >
        {isVertical ? colorStrip : null}
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2">
          <p className="text-center text-[0.55rem] font-bold leading-tight text-white">
            {tileLabel(tile)}
          </p>
          <span className="text-[0.55rem] text-slate-400">
            {tile.group?.toUpperCase() ?? tile.type}
          </span>
        </div>
        {!isVertical ? colorStrip : null}
        {renderTokenCluster(area)}
      </div>
    );
  };

  const renderSpecialTile = (tile: TileDefinition, area: string, boardIndex: number) => {
    const isFinal = finalMovementIndex === boardIndex;
    const isPassing = movementSet.has(boardIndex) && !isFinal;
    const highlight = isFinal
      ? "ring-2 ring-primary/70 shadow-[0_0_15px_rgba(43,108,238,0.6)] animate-pulse"
      : isPassing
      ? "ring-1 ring-primary/30 shadow-[0_0_6px_rgba(43,108,238,0.15)]"
      : "";
    return (
      <div
        key={tile.id}
        className={`${tileBaseClass} flex flex-col items-center justify-center gap-1 px-1 py-2 text-center ${highlight}`}
        style={{ gridArea: area }}
      >
        <span className="material-symbols-outlined text-base text-primary">
          {tile.icon ?? tileIconDefaults[tile.type]}
        </span>
        <span className="text-[0.55rem] text-white">{tileLabel(tile)}</span>
        {renderTokenCluster(area)}
      </div>
    );
  };

  const canUpgrade = Boolean(
    activeTile?.id &&
      activePropertyMeta &&
      activePlayer &&
      activePropertyMeta.ownerId === activePlayer.id &&
      activePropertyMeta.houses < MAX_UPGRADE_LEVEL &&
      !activePropertyMeta.mortgaged &&
      ownsGroup(activePlayer.id, activeTile, propertyState) &&
      activeTile.houseCost,
  );

  const nextUpgradeLevel = activePropertyMeta ? activePropertyMeta.houses + 1 : 1;
  const upgradeCost = determineUpgradeCost(activeTile ?? null, nextUpgradeLevel);

  const canMortgage = Boolean(
    activeTile?.id &&
      activePropertyMeta &&
      activePlayer &&
      activePropertyMeta.ownerId === activePlayer.id &&
      activePropertyMeta.houses === 0 &&
      !activePropertyMeta.mortgaged,
  );

  const canRedeem = Boolean(
    activeTile?.id &&
      activePropertyMeta &&
      activePlayer &&
      activePropertyMeta.ownerId === activePlayer.id &&
      activePropertyMeta.mortgaged,
  );

  const baseMortgageValue = activeTile
    ? Math.max(0, activeTile.mortgage ?? Math.round((activeTile.price ?? 0) / 2))
    : 0;
  const redeemCost = Math.ceil(baseMortgageValue * 1.1);

  return (
    <div className="flex min-h-screen flex-col bg-background-dark text-white lg:flex-row">
      <aside className="w-full border-b border-white/10 bg-black/30 px-4 py-6 backdrop-blur lg:w-72 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            {t("playerPanelTitle")}
          </p>
          <span className="text-xs text-slate-500">{t("currencySymbol")}</span>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {players.map((player, index) => {
            const isActive = index === currentTurnIndex % players.length;
            const tile = BOARD_TILES[player.position];
            const tokenMeta = getTokenDefinition(player.tokenId);
            const ownedTiles = ownershipMap[player.id] ?? [];
            const sortedHoldings = sortHoldings(ownedTiles);
            return (
              <div
                key={player.id}
                className={`rounded-xl border bg-white/5 p-3 backdrop-blur transition-all ${
                  isActive ? "border-primary/80 shadow-lg shadow-primary/20" : "border-white/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <img
                    src={tokenMeta?.image ?? defaultTokenImage}
                    alt={t(tokenMeta?.labelKey ?? "token.teslaCoil")}
                    className="h-10 w-10 rounded-full border border-white/10 bg-slate-900/60 object-contain p-1"
                  />
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-bold leading-tight">{player.name}</span>
                    <span className="text-xs text-slate-400">{tileLabel(tile)}</span>
                  </div>
                  <span className="text-sm font-semibold">
                    {currencyFormatter(currency, player.funds)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[0.65rem] text-slate-400">
                  <span>
                    {player.inJail ? t("statusInJail") : `#${player.position}`}
                  </span>
                  <span>{t(tokenMeta?.labelKey ?? "token.teslaCoil")}</span>
                </div>
                <div className="mt-2">
                  <p className="text-[0.55rem] font-semibold uppercase tracking-[0.3em] text-slate-500">
                    {t("portfolioLabel")}
                  </p>
                  {sortedHoldings.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {sortedHoldings.map((ownedTile) => (
                        <span
                          key={`${player.id}-${ownedTile.id}`}
                          className="rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold text-white/90"
                          style={{
                            backgroundColor: ownedTile.color ? `${ownedTile.color}22` : "rgba(71,85,105,0.4)",
                            borderColor: ownedTile.color ?? "rgba(148,163,184,0.4)",
                            color: ownedTile.color ? "#fff" : "#cbd5f5",
                          }}
                        >
                          {tileLabel(ownedTile)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[0.65rem] text-slate-500">{t("portfolioEmpty")}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            {t("dicePanelTitle")}
          </p>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex gap-2 text-lg font-bold text-white">
              {[dieA, dieB].map((value, idx) => (
                <span
                  key={`sidebar-die-${idx}`}
                  className={`flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-white/10 text-xl ${
                    isRolling ? "animate-bounce" : ""
                  }`}
                >
                  {value}
                </span>
              ))}
            </div>
            <button
              type="button"
              disabled={rollDisabled}
              onClick={handleRoll}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide text-white transition-colors ${
                rollDisabled ? "cursor-not-allowed bg-primary/40" : "bg-primary/80 hover:bg-primary"
              }`}
            >
              {t("rollDice")}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="relative flex flex-1 items-center justify-center px-4 py-6">
          <div className="relative w-full max-w-5xl">
            <div className="relative aspect-square w-full rounded-[32px] border border-white/5 bg-black/20 p-4 shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
              {lastCard && (
                <div className="pointer-events-auto absolute -top-6 left-1/2 z-30 w-full max-w-sm -translate-x-1/2 rounded-2xl border border-primary/30 bg-black/80 p-4 text-left shadow-2xl shadow-primary/20">
                  <p className="text-xs font-semibold uppercase tracking-[0.4em] text-primary">
                    {lastCard.type === "chance" ? t("cardChanceLabel") : t("cardChestLabel")}
                  </p>
                  <h3 className="mt-2 text-xl font-bold leading-tight">{lastCard.title}</h3>
                  <p className="text-sm text-slate-300">{lastCard.description}</p>
                  <button
                    type="button"
                    onClick={() => dismissCard()}
                    className="mt-4 inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition-colors hover:bg-white/10"
                  >
                    {t("dismissCard")}
                  </button>
                </div>
              )}
              {pendingAction && pendingTile && pendingPlayer && (
                <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-4">
                  <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-black/80 p-5 text-left shadow-2xl shadow-black/60 backdrop-blur">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
                          {pendingAction.type === "purchase"
                            ? t("purchasePromptTitle")
                            : t("upgradePromptTitle")}
                        </p>
                        <h3 className="text-2xl font-bold text-white">{tileLabel(pendingTile)}</h3>
                        <p className="text-sm text-slate-300">
                          {pendingAction.type === "purchase"
                            ? t("purchasePromptDesc", {
                                player: pendingPlayer.name,
                                price: currencyFormatter(currency, pendingAction.price),
                              })
                            : t("upgradePromptDesc", {
                                level: pendingAction.nextLevel,
                                price: currencyFormatter(currency, pendingAction.price),
                              })}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                        {currencyFormatter(currency, pendingPlayer.funds)}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          playSound("ui");
                          pendingAction.type === "purchase" ? confirmPurchase() : confirmUpgrade();
                        }}
                        className="rounded-lg bg-primary px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-primary/90"
                      >
                        {pendingAction.type === "purchase"
                          ? t("purchaseBuyButton", {
                              price: currencyFormatter(currency, pendingAction.price),
                            })
                          : t("upgradeBuyButton", {
                              price: currencyFormatter(currency, pendingAction.price),
                              level: pendingAction.nextLevel,
                            })}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playSound("ui");
                          pendingAction.type === "purchase" ? declinePurchase() : declineUpgrade();
                        }}
                        className="rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-200 transition-colors hover:bg-white/10"
                      >
                        {pendingAction.type === "purchase"
                          ? t("purchasePassButton")
                          : t("upgradePassButton")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {tradeModalVisible &&
                pendingTrade &&
                pendingTradeInfo?.fromPlayer &&
                pendingTradeInfo?.toPlayer && (
                  <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-black/80 p-5 text-left shadow-2xl shadow-black/60 backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-[0.4em] text-primary">
                        {t("tradeIncomingTitle", { name: pendingTradeInfo.fromPlayer.name })}
                      </p>
                      <div className="mt-4 space-y-4 text-white">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                            {t("tradeOfferGiveSection", { name: pendingTradeInfo.fromPlayer.name })}
                          </p>
                          <ul className="mt-2 space-y-1">
                            {renderTradeItems(pendingTrade.giveCash, pendingTrade.giveTiles)}
                          </ul>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                            {t("tradeOfferReceiveSection", { name: pendingTradeInfo.toPlayer.name })}
                          </p>
                          <ul className="mt-2 space-y-1">
                            {renderTradeItems(pendingTrade.receiveCash, pendingTrade.receiveTiles)}
                          </ul>
                        </div>
                      </div>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => {
                            playSound("ui");
                            acceptTradeProposal();
                          }}
                          className="rounded-lg bg-primary px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-primary/90"
                        >
                          {t("tradeAcceptButton")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            playSound("ui");
                            rejectTradeProposal(activePlayer?.id);
                          }}
                          className="rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-200 transition-colors hover:bg-white/10"
                        >
                          {t("tradeRejectButton")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              {eliminationNotice && (
                <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center p-4">
                  <div className="w-full max-w-md rounded-2xl border border-rose-400/40 bg-black/85 p-6 text-center shadow-2xl shadow-black/60 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.4em] text-rose-300">
                      {t("eliminationTitle")}
                    </p>
                    <ul className="mt-4 space-y-1 text-lg font-bold text-white">
                      {eliminationNotice.map((name) => (
                        <li key={`elim-${name}`}>{name}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm text-slate-300">{t("eliminationSubtitle")}</p>
                    <button
                      type="button"
                      onClick={() => setEliminationNotice(null)}
                      className="mt-6 inline-flex items-center justify-center rounded-lg bg-white/15 px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition-colors hover:bg-white/25"
                    >
                      {t("eliminationDismiss")}
                    </button>
                  </div>
                </div>
              )}
              {winnerNotice && (
                <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center p-4">
                  <div className="w-full max-w-md rounded-2xl border border-emerald-400/40 bg-black/85 p-6 text-center shadow-2xl shadow-black/60 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-300">
                      {t("winnerTitle")}
                    </p>
                    <p className="mt-4 text-3xl font-black text-white">{winnerNotice}</p>
                    <p className="mt-2 text-sm text-slate-200">{t("winnerSubtitle")}</p>
                    <button
                      type="button"
                      onClick={() => setWinnerNotice(null)}
                      className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition-colors hover:bg-primary/90"
                    >
                      {t("winnerDismiss")}
                    </button>
                  </div>
                </div>
              )}
              {pledgeOpen && (
                <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-4">
                  <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-black/80 p-5 text-left shadow-2xl shadow-black/60 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.4em] text-primary">Rehine Alma</p>
                    <div className="mt-4 grid gap-3">
                      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Hedef Oyuncu
                        <select
                          className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                          value={pledgeTarget}
                          onChange={(e) => {
                            setPledgeTarget(e.target.value);
                            setPledgeTile(null);
                          }}
                        >
                          <option value="">Seçiniz</option>
                          {players
                            .filter((p) => p.id !== activePlayer?.id)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </label>

                      {pledgeTarget && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Mülkleri</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(ownershipMap[pledgeTarget] ?? []).length > 0 ? (
                              (ownershipMap[pledgeTarget] ?? []).map((tile) => {
                                const selected = pledgeTile === tile.id;
                                return (
                                  <button
                                    key={`pledge-${tile.id}`}
                                    type="button"
                                    onClick={() => setPledgeTile(tile.id)}
                                    className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold transition-colors ${
                                      selected
                                        ? "border-primary bg-primary/20 text-white"
                                        : "border-white/10 text-slate-300 hover:border-white/30"
                                    }`}
                                  >
                                    {tileLabel(tile)}
                                  </button>
                                );
                              })
                            ) : (
                              <span className="text-[0.65rem] text-slate-500">Mülk yok</span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={!pledgeTarget || !pledgeTile}
                          onClick={() => {
                            if (!pledgeTarget || !pledgeTile) return;
                            playSound("ui");
                            claimPledgeFrom(pledgeTarget, pledgeTile);
                            setPledgeOpen(false);
                            setPledgeTarget("");
                            setPledgeTile(null);
                          }}
                          className={`rounded-lg bg-primary px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition-colors ${
                            !pledgeTarget || !pledgeTile ? "opacity-60 cursor-not-allowed" : "hover:bg-primary/90"
                          }`}
                        >
                          Rehine Al
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            playSound("ui");
                            setPledgeOpen(false);
                            setPledgeTarget("");
                            setPledgeTile(null);
                          }}
                          className="rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-200 transition-colors hover:bg-white/10"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div
                className="board relative h-full w-full"
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px repeat(9, minmax(0, 1fr)) 80px",
                  gridTemplateRows: "80px repeat(9, minmax(0, 1fr)) 80px",
                  gap: "2px",
                  gridTemplateAreas: boardTemplate,
                }}
              >
                <div
                  className="col-start-2 col-span-9 row-start-2 row-span-9 flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/70 to-slate-900/40 text-center shadow-inner shadow-black/70"
                  style={{ gridArea: "center" }}
                >
                  <h1 className="text-5xl font-black tracking-wide text-white">ZeiTown</h1>
                  {activePlayer && (
                    <p className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-400">
                      {t("turnIndicator", { name: activePlayer.name })}
                    </p>
                  )}
                </div>

                {areaTiles.map(({ area, tile }) => {
                  if (!tile) return null;
                  const tileIndex = BOARD_TILES.indexOf(tile);
                  return tile.type === "property"
                    ? renderPropertyTile(tile, area, getOrientation(area), tileIndex)
                    : renderSpecialTile(tile, area, tileIndex);
                })}
              </div>

              <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/5" />

            </div>
          </div>
        </div>
      </div>

      <aside className="w-full border-t border-white/10 bg-black/20 px-4 py-6 backdrop-blur lg:w-80 lg:border-t-0 lg:border-l">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                {t("actionPanelTitle")}
              </p>
              <span className="text-xs text-slate-400">{rentPreview}</span>
            </div>
            <h3 className="mt-2 text-xl font-bold leading-tight">{tileLabel(activeTile)}</h3>
            <p className="text-sm text-slate-300">{activeTile?.description ?? ""}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  {t("ownerLabel")}
                </span>
                <span className="font-semibold">
                  {tileOwner?.name ?? t("tileFreeLabel")}
                </span>
              </div>
              {activePlayer?.inJail && (
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playSound("ui");
                      // pay 200 to leave jail
                      leaveJailByPayment(activePlayer.id);
                    }}
                    className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white"
                  >
                    {t("leaveJailPay", { price: `${currency} 200` })}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playSound("ui");
                      useJailCard(activePlayer.id);
                    }}
                    disabled={!activePlayer?.hasGetOutOfJail}
                    className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                      activePlayer?.hasGetOutOfJail ? "bg-emerald-500" : "bg-white/5 text-slate-400"
                    }`}
                  >
                    {t("useJailCard")}
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  {t("investmentLabel")}
                </span>
                <span className="font-semibold">
                  {activePropertyMeta
                    ? `${activePropertyMeta.houses}/${MAX_UPGRADE_LEVEL}`
                    : "0/5"}
                </span>
              </div>
              {activePropertyMeta?.mortgaged && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
                  {t("tileMortgagedLabel")}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <button
              type="button"
              onClick={() => setActionsOpen((prev) => !prev)}
              className="flex w-full items-center justify-between text-left"
              aria-expanded={actionsOpen}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                {t("availableActions")}
              </p>
              <span
                className={`material-symbols-outlined text-base transition-transform ${
                  actionsOpen ? "rotate-0" : "-rotate-90"
                }`}
              >
                expand_less
              </span>
            </button>
            {actionsOpen && (
              <>
                <p className="mt-1 text-sm text-slate-300">{t("actionsHint")}</p>
                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    disabled={!canUpgrade || !activeTile?.id}
                    onClick={() => {
                      if (!activeTile?.id) return;
                      playSound("ui");
                      requestUpgrade(activeTile.id);
                    }}
                    className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left transition-all ${
                      canUpgrade
                        ? "border-primary/40 bg-primary/10 text-white hover:bg-primary/20"
                        : "border-white/10 bg-white/5 text-slate-400"
                    }`}
                  >
                    <span className="text-sm font-semibold">{t("upgradeAction")}</span>
                    <span className="text-xs text-slate-300">
                      {canUpgrade
                        ? `${t("currencySymbol")} ${upgradeCost.toLocaleString()} · L${nextUpgradeLevel}`
                        : t("actionUnavailable")}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!canMortgage || !activeTile?.id}
                    onClick={() => {
                      if (!activeTile?.id) return;
                      playSound("ui");
                      mortgageProperty(activeTile.id);
                    }}
                    className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left transition-all ${
                      canMortgage
                        ? "border-amber-400/40 bg-amber-400/10 text-white hover:bg-amber-400/20"
                        : "border-white/10 bg-white/5 text-slate-400"
                    }`}
                  >
                    <span className="text-sm font-semibold">{t("mortgageAction")}</span>
                    <span className="text-xs text-slate-300">
                      {canMortgage
                        ? currencyFormatter(currency, baseMortgageValue)
                        : t("actionUnavailable")}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!canRedeem || !activeTile?.id}
                    onClick={() => {
                      if (!activeTile?.id) return;
                      playSound("ui");
                      redeemProperty(activeTile.id);
                    }}
                    className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left transition-all ${
                      canRedeem
                        ? "border-emerald-400/40 bg-emerald-400/10 text-white hover:bg-emerald-400/20"
                        : "border-white/10 bg-white/5 text-slate-400"
                    }`}
                  >
                    <span className="text-sm font-semibold">{t("redeemAction")}</span>
                    <span className="text-xs text-slate-300">
                      {canRedeem ? currencyFormatter(currency, redeemCost) : t("actionUnavailable")}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPledgeOpen(true)}
                    className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left transition-all bg-white/5 text-slate-200`}
                  >
                    <span className="text-sm font-semibold">Rehine Al</span>
                    <span className="text-xs text-slate-300">Başkasının mülkünü rehine al</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <button
              type="button"
              onClick={() => setTradeOpen((prev) => !prev)}
              className="flex w-full items-center justify-between text-left"
              aria-expanded={tradeOpen}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {t("tradePanelTitle")}
                </p>
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-primary">
                  {t("tradeLiveBadge")}
                </span>
              </div>
              <span
                className={`material-symbols-outlined text-base transition-transform ${
                  tradeOpen ? "rotate-0" : "-rotate-90"
                }`}
              >
                expand_less
              </span>
            </button>
            {tradeOpen && (
              <>
                {pendingTradeInfo && (
                  <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
                    {pendingTrade?.toId === activePlayer?.id
                      ? t("tradePendingIncomingShort", {
                          name: pendingTradeInfo.fromPlayer?.name ?? "",
                        })
                      : pendingTrade?.fromId === activePlayer?.id
                        ? t("tradePendingSelf", { name: pendingTradeInfo.toPlayer?.name ?? "" })
                        : t("tradePendingNotice", {
                            from: pendingTradeInfo.fromPlayer?.name ?? "",
                            to: pendingTradeInfo.toPlayer?.name ?? "",
                          })}
                    {pendingTrade?.fromId === activePlayer?.id && (
                      <button
                        type="button"
                        onClick={() => {
                          rejectTradeProposal(activePlayer?.id);
                        }}
                        className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-slate-200 hover:bg-white/10"
                      >
                        {t("tradeWithdrawButton")}
                      </button>
                    )}
                  </div>
                )}
                <p className="mt-2 text-sm text-slate-300">{t("tradeOfferHint")}</p>

                <div className="mt-4 grid gap-3 text-sm">
                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {t("tradeFromLabel")}
                    <select
                      className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                      value={tradeFrom}
                      onChange={(event) => setTradeFrom(event.target.value)}
                    >
                      {players.map((player) => (
                        <option key={`from-${player.id}`} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {t("tradeToLabel")}
                    <select
                      className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                      value={tradeTo}
                      onChange={(event) => setTradeTo(event.target.value)}
                    >
                      {players
                        .filter((player) => player.id !== tradeFrom)
                        .map((player) => (
                          <option key={`to-${player.id}`} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {t("tradeGiveCashLabel")}
                    <input
                      type="number"
                      min="0"
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-primary focus:outline-none"
                      value={offerGiveCash}
                      onChange={(event) => setOfferGiveCash(event.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {t("tradeReceiveCashLabel")}
                    <input
                      type="number"
                      min="0"
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-primary focus:outline-none"
                      value={offerReceiveCash}
                      onChange={(event) => setOfferReceiveCash(event.target.value)}
                    />
                  </label>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {t("tradeGiveCardsLabel", { name: tradeFromPlayer?.name ?? "-" })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tradeFromTiles.length > 0 ? (
                        tradeFromTiles.map((tile) => {
                          const selected = offerGiveTiles.includes(tile.id);
                          return (
                            <button
                              key={`give-chip-${tile.id}`}
                              type="button"
                              onClick={() => toggleGiveTile(tile.id)}
                              className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold transition-colors ${
                                selected
                                  ? "border-primary bg-primary/20 text-white"
                                  : "border-white/10 text-slate-300 hover:border-white/30"
                              }`}
                            >
                              {tileLabel(tile)}
                            </button>
                          );
                        })
                      ) : (
                        <span className="text-[0.65rem] text-slate-500">{t("tradeNoCards")}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {t("tradeReceiveCardsLabel", { name: tradeToPlayer?.name ?? "-" })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tradeToTiles.length > 0 ? (
                        tradeToTiles.map((tile) => {
                          const selected = offerReceiveTiles.includes(tile.id);
                          return (
                            <button
                              key={`receive-chip-${tile.id}`}
                              type="button"
                              onClick={() => toggleReceiveTile(tile.id)}
                              className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold transition-colors ${
                                selected
                                  ? "border-emerald-400 bg-emerald-400/20 text-white"
                                  : "border-white/10 text-slate-300 hover:border-white/30"
                              }`}
                            >
                              {tileLabel(tile)}
                            </button>
                          );
                        })
                      ) : (
                        <span className="text-[0.65rem] text-slate-500">{t("tradeNoCards")}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSendTrade}
                  disabled={Boolean(pendingTrade)}
                  className={`mt-4 w-full rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition-colors ${
                    pendingTrade ? "cursor-not-allowed bg-primary/30" : "bg-primary hover:bg-primary/90"
                  }`}
                >
                  {t("tradeSendOfferButton")}
                </button>

                {tradeError && (
                  <p className="mt-3 text-xs font-semibold text-rose-300">{tradeError}</p>
                )}
                {tradeSuccess && (
                  <p className="mt-2 text-xs font-semibold text-emerald-300">{tradeSuccess}</p>
                )}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <button
              type="button"
              onClick={() => setEventsOpen((prev) => !prev)}
              className="flex w-full items-center justify-between text-left"
              aria-expanded={eventsOpen}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                {t("eventFeedTitle")}
              </p>
              <span
                className={`material-symbols-outlined text-base transition-transform ${
                  eventsOpen ? "rotate-0" : "-rotate-90"
                }`}
              >
                expand_less
              </span>
            </button>
            {eventsOpen && (
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                {recentLogs.length > 0 ? (
                  recentLogs.map((entry, index) => (
                    <div
                      key={`log-entry-${index}-${entry}`}
                      className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[0.8rem]"
                    >
                      {entry}
                    </div>
                  ))
                ) : (
                  <p className="text-slate-400">{logFallback}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};
