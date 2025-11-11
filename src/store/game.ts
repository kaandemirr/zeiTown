import { create } from "zustand";

import {
  BOARD_TILES,
  CHANCE_CARDS,
  CHEST_CARDS,
  type CardDefinition,
  type TileDefinition,
} from "../data/board";
import { playSound } from "../lib/sound";

export type GamePhase = "lobby" | "setup" | "rolling" | "trading" | "summary";

export interface Player {
  id: string;
  name: string;
  color: string;
  funds: number;
  position: number;
  tokenId: string;
  inJail: boolean;
  jailTurns: number;
  hasGetOutOfJail: boolean;
}

export interface PropertyState {
  ownerId: string | null;
  houses: number;
  mortgaged: boolean;
}

interface TradeProposal {
  id: string;
  fromId: string;
  toId: string;
  giveCash: number;
  receiveCash: number;
  giveTiles: string[];
  receiveTiles: string[];
}

interface AuctionState {
  tileId: string;
  excludedPlayerId: string | null;
  highestBid: number;
  highestBidderId: string | null;
  open: boolean;
}

type PendingAction =
  | {
      type: "purchase";
      tileId: string;
      playerId: string;
      price: number;
    }
  | {
      type: "upgrade";
      tileId: string;
      playerId: string;
      price: number;
      nextLevel: number;
    }
  | null;

type CardSnapshot = {
  type: "chance" | "chest";
  title: string;
  description: string;
};

interface GameState {
  players: Player[];
  phase: GamePhase;
  playerCount: number;
  currentTurnIndex: number;
  lastRoll: [number, number];
  consecutiveDoubles: number;
  propertyState: Record<string, PropertyState>;
  pendingAction: PendingAction;
  pendingNextTurnIndex: number | null;
  chanceIndex: number;
  chestIndex: number;
  lastCard: CardSnapshot | null;
  logs: string[];
  pendingTrade: TradeProposal | null;
  auction: AuctionState | null;
  lastMovementPath: number[];
  addPlayer: (
    player: Omit<Player, "funds" | "position" | "inJail" | "jailTurns" | "hasGetOutOfJail">,
  ) => void;
  updatePhase: (phase: GamePhase) => void;
  setPlayers: (
    players: Omit<Player, "funds" | "position" | "inJail" | "jailTurns" | "hasGetOutOfJail">[],
  ) => void;
  setPlayerCount: (count: number) => void;
  rollDiceAndResolve: () => void;
  confirmPurchase: () => void;
  declinePurchase: () => void;
  confirmUpgrade: () => void;
  declineUpgrade: () => void;
  requestUpgrade: (tileId: string) => void;
  mortgageProperty: (tileId: string) => void;
  redeemProperty: (tileId: string) => void;
  sendTradeProposal: (payload: Omit<TradeProposal, "id">) => boolean;
  acceptTradeProposal: () => boolean;
  rejectTradeProposal: (initiatorId?: string) => boolean;
  placeAuctionBid: (playerId: string, amount: number) => void;
  closeAuction: () => void;
  leaveJailByPayment: (playerId: string) => void;
  useJailCard: (playerId: string) => void;
  dismissCard: () => void;
  reset: () => void;
}

const START_FUNDS = 1500;
const PASS_START_BONUS = 200;
const MAX_LOGS = 6;
const MAX_UPGRADE_LEVEL = 5;
const MAX_JAIL_TURNS = 3;

const START_INDEX = BOARD_TILES.findIndex((tile) => tile.type === "start") ?? 0;
const JAIL_INDEX = BOARD_TILES.findIndex((tile) => tile.id === "just-visiting") ?? 10;

const PURCHASABLE_TYPES = new Set<TileDefinition["type"]>([
  "property",
  "railway",
  "utility",
]);

const rollDie = () => Math.floor(Math.random() * 6) + 1;
const formatFunds = (value: number) => `ZC ${value.toLocaleString("en-US")}`;

const createPropertyState = (): Record<string, PropertyState> => {
  const map: Record<string, PropertyState> = {};
  for (const tile of BOARD_TILES) {
    if (tile.id && PURCHASABLE_TYPES.has(tile.type)) {
      map[tile.id] = { ownerId: null, houses: 0, mortgaged: false };
    }
  }
  return map;
};

const clonePropertyState = (state: Record<string, PropertyState>) => {
  const result: Record<string, PropertyState> = {};
  for (const [key, value] of Object.entries(state)) {
    result[key] = { ...value };
  }
  return result;
};

const addLog = (logs: string[], entry: string) => {
  const next = [...logs, entry];
  return next.slice(-MAX_LOGS);
};

const normalizePosition = (value: number) => {
  const length = BOARD_TILES.length;
  return ((value % length) + length) % length;
};

const ownsFullSet = (
  ownerId: string,
  tile: TileDefinition,
  propertyState: Record<string, PropertyState>,
) => {
  if (!tile.group) return false;
  const groupTiles = BOARD_TILES.filter((t) => t.group === tile.group);
  return groupTiles.every(
    (groupTile) =>
      groupTile.id &&
      propertyState[groupTile.id] &&
      propertyState[groupTile.id].ownerId === ownerId,
  );
};

const countOwnedInGroup = (
  ownerId: string,
  tile: TileDefinition,
  propertyState: Record<string, PropertyState>,
) => {
  if (!tile.group) return 0;
  return BOARD_TILES.filter(
    (t) =>
      t.group === tile.group &&
      t.id &&
      propertyState[t.id]?.ownerId === ownerId,
  ).length;
};

const uniqueArray = <T,>(items: T[]): T[] => Array.from(new Set(items));
const createTradeId = () => `trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const computeMovementPath = (start: number, steps: number) => {
  const path: number[] = [];
  if (steps === 0) return path;
  const direction = steps >= 0 ? 1 : -1;
  const total = Math.abs(steps);
  for (let i = 1; i <= total; i += 1) {
    path.push(normalizePosition(start + direction * i));
  }
  return path;
};

const computeForwardPath = (start: number, target: number) => {
  const length = BOARD_TILES.length;
  const steps = (target - start + length) % length;
  return computeMovementPath(start, steps);
};

const calculateRent = (
  tile: TileDefinition,
  playerRoll: number,
  propertyState: Record<string, PropertyState>,
  ownerId: string,
) => {
  if (!tile.id) return 0;
  const propertyMeta = propertyState[tile.id];
  if (!propertyMeta) return 0;

  if (tile.type === "railway") {
    const owned = countOwnedInGroup(ownerId, tile, propertyState);
    return 25 * Math.max(1, owned);
  }

  if (tile.type === "utility") {
    const owned = countOwnedInGroup(ownerId, tile, propertyState);
    return playerRoll * (owned >= 2 ? 10 : 4);
  }

  let rent = tile.rent ?? Math.max(10, Math.round(((tile.price ?? 0) * 10) / 100));

  if (propertyMeta.houses > 0 && tile.rentLevels?.length) {
    const levelIndex = Math.min(propertyMeta.houses, tile.rentLevels.length) - 1;
    rent = tile.rentLevels[levelIndex] ?? rent;
  } else if (ownsFullSet(ownerId, tile, propertyState)) {
    rent *= 2;
  }

  return rent;
};

const applyPassStartBonus = (
  player: Player,
  previous: number,
  next: number,
  movedForward: boolean,
) => {
  if (movedForward && next < previous) {
    player.funds += PASS_START_BONUS;
    return true;
  }
  return false;
};

const getMortgageValue = (tile: TileDefinition) => {
  if (!tile.price && !tile.mortgage) return 0;
  return tile.mortgage ?? Math.round((tile.price ?? 0) / 2);
};

type PaymentOutcome = {
  players: Player[];
  propertyState: Record<string, PropertyState>;
  logs: string[];
  removedIndex: number | null;
  bankruptPlayerId: string | null;
};

const handleBankruptcy = (
  players: Player[],
  propertyState: Record<string, PropertyState>,
  bankruptId: string,
  creditorId: string | null,
  logs: string[],
): PaymentOutcome => {
  const index = players.findIndex((player) => player.id === bankruptId);
  if (index === -1) {
    return { players, propertyState, logs, removedIndex: null, bankruptPlayerId: null };
  }

  const bankruptPlayer = players[index];
  const creditor = creditorId
    ? players.find((player) => player.id === creditorId) ?? null
    : null;

  const nextPropertyState = clonePropertyState(propertyState);
  for (const meta of Object.values(nextPropertyState)) {
    if (meta.ownerId === bankruptPlayer.id) {
      if (creditor) {
        meta.ownerId = creditor.id;
      } else {
        meta.ownerId = null;
        meta.houses = 0;
        meta.mortgaged = false;
      }
    }
  }

  const resultPlayers = players.filter((_, idx) => idx !== index);
  const message = creditor
    ? `${bankruptPlayer.name} transferred all assets to ${creditor.name} and left the city.`
    : `${bankruptPlayer.name} filed for bankruptcy and returned assets to the municipality.`;
  const nextLogs = addLog(logs, message);

  return {
    players: resultPlayers,
    propertyState: nextPropertyState,
    logs: nextLogs,
    removedIndex: index,
    bankruptPlayerId: bankruptPlayer.id,
  };
};

const payAmount = (
  players: Player[],
  propertyState: Record<string, PropertyState>,
  payerId: string,
  receiverId: string | null,
  amount: number,
  logs: string[],
): PaymentOutcome => {
  if (amount <= 0) {
    return { players, propertyState, logs, removedIndex: null, bankruptPlayerId: null };
  }

  const payerIndex = players.findIndex((player) => player.id === payerId);
  if (payerIndex === -1) {
    return { players, propertyState, logs, removedIndex: null, bankruptPlayerId: null };
  }

  const payer = players[payerIndex];
  if (payer.funds >= amount) {
    payer.funds -= amount;
    if (receiverId) {
      const receiver = players.find((player) => player.id === receiverId);
      if (receiver) {
        receiver.funds += amount;
      }
    }
    return { players, propertyState, logs, removedIndex: null, bankruptPlayerId: null };
  }

  const available = payer.funds;
  if (available > 0 && receiverId) {
    const receiver = players.find((player) => player.id === receiverId);
    if (receiver) {
      receiver.funds += available;
    }
  }

  payer.funds = 0;
  return handleBankruptcy(players, propertyState, payer.id, receiverId, logs);
};

const sendPlayerToJail = (player: Player) => {
  player.position = JAIL_INDEX;
  player.inJail = true;
  player.jailTurns = 0;
};

const resolveJailState = (
  player: Player,
  dieA: number,
  dieB: number,
  players: Player[],
  propertyState: Record<string, PropertyState>,
  logs: string[],
): {
  canMove: boolean;
  players: Player[];
  propertyState: Record<string, PropertyState>;
  logs: string[];
  removedIndex: number | null;
} => {
  if (!player.inJail) {
    return { canMove: true, players, propertyState, logs, removedIndex: null };
  }

  if (player.hasGetOutOfJail) {
    player.hasGetOutOfJail = false;
    player.inJail = false;
    player.jailTurns = 0;
    const nextLogs = addLog(logs, `${player.name} used a release permit.`);
    return { canMove: true, players, propertyState, logs: nextLogs, removedIndex: null };
  }

  if (dieA === dieB) {
    player.inJail = false;
    player.jailTurns = 0;
    const nextLogs = addLog(logs, `${player.name} rolled doubles and left city hall.`);
    return { canMove: true, players, propertyState, logs: nextLogs, removedIndex: null };
  }

  player.jailTurns += 1;
  let nextLogs = addLog(logs, `${player.name} waits in city hall (${player.jailTurns}/${MAX_JAIL_TURNS}).`);

  if (player.jailTurns >= MAX_JAIL_TURNS) {
    const result = payAmount(players, propertyState, player.id, null, 50, nextLogs);
    const updatedPlayers = result.players;
    const updatedPropertyState = result.propertyState;

    if (result.bankruptPlayerId === player.id) {
      return {
        canMove: false,
        players: updatedPlayers,
        propertyState: updatedPropertyState,
        logs: result.logs,
        removedIndex: result.removedIndex,
      };
    }

    const holder = updatedPlayers.find((p) => p.id === player.id);
    if (holder) {
      holder.inJail = false;
      holder.jailTurns = 0;
    }

    nextLogs = addLog(result.logs, `${player.name} paid ${formatFunds(50)} to exit city hall.`);
    return {
      canMove: true,
      players: updatedPlayers,
      propertyState: updatedPropertyState,
      logs: nextLogs,
      removedIndex: result.removedIndex,
    };
  }

  return { canMove: false, players, propertyState, logs: nextLogs, removedIndex: null };
};

const handleChanceOrChest = (
  card: CardDefinition,
  player: Player,
  players: Player[],
  propertyState: Record<string, PropertyState>,
  logs: string[],
): {
  players: Player[];
  propertyState: Record<string, PropertyState>;
  logs: string[];
  followUpPosition: number | null;
  movementPath: number[];
} => {
  let nextLogs = addLog(logs, card.title);
  let followUpPosition: number | null = null;
  let movementPath: number[] = [];

  switch (card.effect.action) {
    case "collect":
      player.funds += card.effect.amount;
      nextLogs = addLog(nextLogs, `${player.name} received ${formatFunds(card.effect.amount)}.`);
      break;
    case "pay": {
      const result = payAmount(players, propertyState, player.id, null, card.effect.amount, nextLogs);
      return {
        players: result.players,
        propertyState: result.propertyState,
        logs: result.logs,
        followUpPosition: null,
        movementPath: [],
      };
    }
    case "move": {
      const previous = player.position;
      player.position = normalizePosition(card.effect.target);
      movementPath = computeForwardPath(previous, player.position);
      if (applyPassStartBonus(player, previous, player.position, true)) {
        nextLogs = addLog(nextLogs, `${player.name} collected ${formatFunds(PASS_START_BONUS)} at City Gate.`);
      }
      followUpPosition = player.position;
      break;
    }
    case "move-relative": {
      const previous = player.position;
      player.position = normalizePosition(player.position + card.effect.offset);
      movementPath = computeMovementPath(previous, card.effect.offset);
      if (card.effect.offset > 0) {
        applyPassStartBonus(player, previous, player.position, true);
      }
      followUpPosition = player.position;
      break;
    }
    case "advance-to-next": {
      for (let offset = 1; offset <= BOARD_TILES.length; offset += 1) {
        const candidate = BOARD_TILES[(player.position + offset) % BOARD_TILES.length];
        if (candidate.type === card.effect.tileType) {
          const previous = player.position;
          player.position = normalizePosition(player.position + offset);
          movementPath = computeMovementPath(previous, offset);
          applyPassStartBonus(player, previous, player.position, true);
          followUpPosition = player.position;
          break;
        }
      }
      break;
    }
    case "repair": {
      const ownedTiles = Object.entries(propertyState).filter(([, value]) => value.ownerId === player.id);
      let total = 0;
      for (const [tileId, value] of ownedTiles) {
        const tileDefinition = BOARD_TILES.find((t) => t.id === tileId);
        if (!tileDefinition) continue;
        const houses = Math.min(value.houses, MAX_UPGRADE_LEVEL - 1);
        const landmarks = value.houses === MAX_UPGRADE_LEVEL ? 1 : 0;
        total += houses * card.effect.houseCost + landmarks * card.effect.hotelCost;
      }
      const result = payAmount(players, propertyState, player.id, null, total, nextLogs);
      return {
        players: result.players,
        propertyState: result.propertyState,
        logs: result.logs,
        followUpPosition: null,
        movementPath: [],
      };
    }
    case "get-out-of-jail":
      player.hasGetOutOfJail = true;
      nextLogs = addLog(nextLogs, `${player.name} received a release permit.`);
      break;
    case "go-to-jail":
      sendPlayerToJail(player);
      nextLogs = addLog(nextLogs, `${player.name} was escorted to city hall.`);
      break;
    case "luck-check": {
      const diceA = rollDie();
      const diceB = rollDie();
      if (diceA === diceB) {
        player.funds += card.effect.success;
        nextLogs = addLog(
          nextLogs,
          `${player.name} rolled doubles and gained ${formatFunds(card.effect.success)}.`,
        );
      } else {
        const result = payAmount(players, propertyState, player.id, null, card.effect.failure, nextLogs);
        return {
          players: result.players,
          propertyState: result.propertyState,
          logs: result.logs,
          followUpPosition: null,
          movementPath: [],
        };
      }
      break;
    }
    default:
      break;
  }

  return { players, propertyState, logs: nextLogs, followUpPosition, movementPath };
};

const determineUpgradeCost = (tile: TileDefinition, nextLevel: number) => {
  if (!tile.houseCost) return 0;
  if (nextLevel <= 4) return tile.houseCost;
  return tile.houseCost * 2;
};

const getActiveTile = (player: Player) => BOARD_TILES[player.position] ?? BOARD_TILES[0];

export const useGameStore = create<GameState>((set) => ({
  players: [],
  phase: "lobby",
  playerCount: 2,
  currentTurnIndex: 0,
  lastRoll: [1, 1],
  consecutiveDoubles: 0,
  propertyState: createPropertyState(),
  pendingAction: null,
  pendingNextTurnIndex: null,
  chanceIndex: 0,
  chestIndex: 0,
  lastCard: null,
  logs: [],
  pendingTrade: null,
  auction: null,
  lastMovementPath: [],
  addPlayer: (player) => {
    set((state) => ({
      players: [
        ...state.players,
        {
          ...player,
          funds: START_FUNDS,
          position: START_INDEX,
          inJail: false,
          jailTurns: 0,
          hasGetOutOfJail: false,
        },
      ],
      playerCount: state.players.length + 1,
    }));
  },
  updatePhase: (phase) => set(() => ({ phase })),
  setPlayers: (playersInput) => {
    set(() => ({
      players: playersInput.map((player) => ({
        ...player,
        funds: START_FUNDS,
        position: START_INDEX,
        inJail: false,
        jailTurns: 0,
        hasGetOutOfJail: false,
      })),
      phase: "rolling",
      currentTurnIndex: 0,
      consecutiveDoubles: 0,
      playerCount: playersInput.length,
      propertyState: createPropertyState(),
      pendingAction: null,
      pendingNextTurnIndex: null,
      logs: [],
      lastCard: null,
      lastRoll: [1, 1],
      chanceIndex: 0,
      chestIndex: 0,
    }));
  },
  setPlayerCount: (count) => set(() => ({ playerCount: count })),
  rollDiceAndResolve: () => {
    set((state) => {
      if (state.phase !== "rolling" || state.players.length === 0 || state.pendingAction) {
        return state;
      }

      const dieA = rollDie();
      const dieB = rollDie();
      const diceTotal = dieA + dieB;

      let players = state.players.map((player) => ({ ...player }));
      let propertyState = clonePropertyState(state.propertyState);
      let logs = state.logs;
      let movementPath: number[] = [];

      let currentIndex = state.currentTurnIndex;
      if (currentIndex >= players.length) currentIndex = 0;
      let activePlayer = players[currentIndex];
      let pendingAction: PendingAction = null;
      let pendingNextTurnIndex: number | null = null;
      let consecutiveDoubles = dieA === dieB ? state.consecutiveDoubles + 1 : 0;
      let stayOnCurrentPlayer = dieA === dieB;
      let lastCard: CardSnapshot | null = null;
      let chanceIndex = state.chanceIndex;
      let chestIndex = state.chestIndex;

      logs = addLog(logs, `${activePlayer.name} rolled ${dieA} + ${dieB}.`);

      if (dieA === dieB && consecutiveDoubles >= 3) {
        sendPlayerToJail(activePlayer);
        logs = addLog(logs, `${activePlayer.name} rolled three doubles in a row and was audited.`);
        consecutiveDoubles = 0;
        stayOnCurrentPlayer = false;
        const nextIndex = players.length > 0 ? (currentIndex + 1) % players.length : 0;
        return {
          ...state,
          players,
          propertyState,
          lastRoll: [dieA, dieB],
          logs,
          currentTurnIndex: nextIndex,
          consecutiveDoubles,
          pendingAction: null,
          pendingNextTurnIndex: null,
          lastCard: null,
          lastMovementPath: [],
        };
      }

      const jailResult = resolveJailState(activePlayer, dieA, dieB, players, propertyState, logs);
      players = jailResult.players;
      propertyState = jailResult.propertyState;
      logs = jailResult.logs;

      if (jailResult.removedIndex !== null) {
        if (jailResult.removedIndex < currentIndex) {
          currentIndex -= 1;
        } else if (jailResult.removedIndex === currentIndex) {
          const nextIndex = players.length > 0 ? currentIndex % players.length : 0;
          return {
            ...state,
            players,
            propertyState,
            logs,
            lastRoll: [dieA, dieB],
            currentTurnIndex: nextIndex,
            consecutiveDoubles: 0,
            pendingAction: null,
            pendingNextTurnIndex: null,
            lastCard: null,
            lastMovementPath: [],
          };
        }
      }

      if (!jailResult.canMove) {
        const nextIndex = players.length > 0 ? (currentIndex + 1) % players.length : 0;
        return {
          ...state,
          players,
          propertyState,
          logs,
          lastRoll: [dieA, dieB],
          currentTurnIndex: nextIndex,
          consecutiveDoubles: 0,
          pendingAction: null,
          pendingNextTurnIndex: null,
          lastCard: null,
          lastMovementPath: [],
        };
      }

      activePlayer = players[currentIndex];

      const previous = activePlayer.position;
      const nextPosition = normalizePosition(previous + diceTotal);
      const passedStart = applyPassStartBonus(activePlayer, previous, nextPosition, diceTotal > 0);
      movementPath = computeMovementPath(previous, diceTotal);
      if (passedStart) {
        logs = addLog(logs, `${activePlayer.name} collected ${formatFunds(PASS_START_BONUS)} at City Gate.`);
      }

      activePlayer.position = nextPosition;
      const tile = getActiveTile(activePlayer);

      if (PURCHASABLE_TYPES.has(tile.type)) {
        const tileState = propertyState[tile.id];
        if (tileState && !tileState.ownerId) {
          pendingAction = {
            type: "purchase",
            tileId: tile.id,
            playerId: activePlayer.id,
            price: tile.price ?? 0,
          };
          pendingNextTurnIndex = stayOnCurrentPlayer ? currentIndex : (currentIndex + 1) % players.length;
          logs = addLog(logs, `${tile.name} is available for ${formatFunds(tile.price ?? 0)}.`);
        } else if (tileState && tileState.ownerId && tileState.ownerId !== activePlayer.id) {
          if (!tileState.mortgaged) {
            const rent = calculateRent(tile, diceTotal, propertyState, tileState.ownerId);
            const owner = players.find((player) => player.id === tileState.ownerId);
            if (owner) {
              logs = addLog(
                logs,
                `${activePlayer.name} owes ${formatFunds(rent)} to ${owner.name}.`,
              );
            }
            const payment = payAmount(players, propertyState, activePlayer.id, tileState.ownerId, rent, logs);
            players = payment.players;
            propertyState = payment.propertyState;
            logs = payment.logs;
            if (payment.removedIndex !== null) {
              if (payment.removedIndex < currentIndex) {
                currentIndex -= 1;
              } else if (payment.removedIndex === currentIndex) {
                const nextIndex = players.length > 0 ? currentIndex % players.length : 0;
                return {
                  ...state,
                  players,
                  propertyState,
                  logs,
                  lastRoll: [dieA, dieB],
                  currentTurnIndex: nextIndex,
                  consecutiveDoubles: 0,
                  pendingAction: null,
                  pendingNextTurnIndex: null,
                  lastCard: null,
                };
              }
            }
          } else {
            logs = addLog(logs, `${tile.name} is mortgaged. No rent due.`);
          }
        }
      } else {
        switch (tile.type) {
          case "tax": {
            const fee = tile.price ?? 100;
            logs = addLog(logs, `${activePlayer.name} paid ${formatFunds(fee)} in zoning fees.`);
            const payment = payAmount(players, propertyState, activePlayer.id, null, fee, logs);
            players = payment.players;
            propertyState = payment.propertyState;
            logs = payment.logs;
            if (payment.removedIndex !== null) {
              if (payment.removedIndex < currentIndex) {
                currentIndex -= 1;
              } else if (payment.removedIndex === currentIndex) {
                const nextIndex = players.length > 0 ? currentIndex % players.length : 0;
                return {
                  ...state,
                  players,
                  propertyState,
                  logs,
                  lastRoll: [dieA, dieB],
                  currentTurnIndex: nextIndex,
                  consecutiveDoubles: 0,
                  pendingAction: null,
                  pendingNextTurnIndex: null,
                  lastCard: null,
                };
              }
            }
            break;
          }
          case "chance": {
          const card = CHANCE_CARDS[chanceIndex % CHANCE_CARDS.length];
          chanceIndex = (chanceIndex + 1) % CHANCE_CARDS.length;
          const result = handleChanceOrChest(card, activePlayer, players, propertyState, logs);
          players = result.players;
          propertyState = result.propertyState;
          logs = result.logs;
          lastCard = { type: "chance", title: card.title, description: card.description };
          playSound("card");
          if (result.followUpPosition !== null) {
            activePlayer.position = result.followUpPosition;
          }
          movementPath = result.movementPath;
          break;
        }
        case "chest": {
          const card = CHEST_CARDS[chestIndex % CHEST_CARDS.length];
          chestIndex = (chestIndex + 1) % CHEST_CARDS.length;
          const result = handleChanceOrChest(card, activePlayer, players, propertyState, logs);
          players = result.players;
          propertyState = result.propertyState;
          logs = result.logs;
          lastCard = { type: "chest", title: card.title, description: card.description };
          playSound("card");
          if (result.followUpPosition !== null) {
            activePlayer.position = result.followUpPosition;
          }
          movementPath = result.movementPath;
          break;
        }
        case "gotojail":
          sendPlayerToJail(activePlayer);
          logs = addLog(logs, `${activePlayer.name} was redirected to city hall.`);
          stayOnCurrentPlayer = false;
          consecutiveDoubles = 0;
          movementPath = [];
          break;
        default:
          break;
      }
      }

      const remainingPlayers = players.length;
      let nextIndex = remainingPlayers > 0 ? (currentIndex + 1) % remainingPlayers : 0;
      if (stayOnCurrentPlayer && remainingPlayers > 0) {
        nextIndex = currentIndex % remainingPlayers;
      }

      if (pendingAction) {
        return {
          ...state,
          players,
          propertyState,
          logs,
          pendingAction,
          pendingNextTurnIndex,
          lastRoll: [dieA, dieB],
          consecutiveDoubles,
          lastMovementPath: movementPath,
          lastCard,
          chanceIndex,
          chestIndex,
        };
      }

      if (!stayOnCurrentPlayer) {
        consecutiveDoubles = 0;
      }

      const nextPhase = players.length <= 1 ? "summary" : state.phase;

      return {
        ...state,
        players,
        propertyState,
        logs,
        pendingAction: null,
        pendingNextTurnIndex: null,
        lastRoll: [dieA, dieB],
        consecutiveDoubles,
        currentTurnIndex: nextIndex,
        lastCard,
        chanceIndex,
        chestIndex,
        phase: nextPhase,
        lastMovementPath: movementPath,
      };
    });
  },
  confirmPurchase: () => {
    set((state) => {
      if (!state.pendingAction || state.pendingAction.type !== "purchase") {
        return state;
      }

      const tile = BOARD_TILES.find((item) => item.id === state.pendingAction!.tileId);
      if (!tile) {
        return {
          ...state,
          pendingAction: null,
          pendingNextTurnIndex: null,
        };
      }

      const players = state.players.map((player) => ({ ...player }));
      const propertyState = clonePropertyState(state.propertyState);
      const logs = [...state.logs];
      const buyerIndex = players.findIndex((player) => player.id === state.pendingAction!.playerId);
      if (buyerIndex === -1) {
        return {
          ...state,
          pendingAction: null,
          pendingNextTurnIndex: null,
        };
      }

      const buyer = players[buyerIndex];
      if (buyer.funds < state.pendingAction.price) {
        const nextLogs = addLog(logs, `${buyer.name} cannot afford ${tile.name}.`);
        const nextIndex = state.pendingNextTurnIndex ?? ((state.currentTurnIndex + 1) % players.length);
        return {
          ...state,
          players,
          logs: nextLogs,
          pendingAction: null,
          pendingNextTurnIndex: null,
          currentTurnIndex: nextIndex,
          consecutiveDoubles: nextIndex === state.currentTurnIndex ? state.consecutiveDoubles : 0,
        };
      }

      buyer.funds -= state.pendingAction.price;
      const propertyMeta = propertyState[tile.id];
      if (propertyMeta) {
        propertyMeta.ownerId = buyer.id;
      }

      const nextLogs = addLog(logs, `${buyer.name} purchased ${tile.name} for ${formatFunds(state.pendingAction.price)}.`);
      const nextIndex = state.pendingNextTurnIndex ?? ((state.currentTurnIndex + 1) % players.length);
      const samePlayerContinues = nextIndex === state.currentTurnIndex;

      return {
        ...state,
        players,
        propertyState,
        logs: nextLogs,
        pendingAction: null,
        pendingNextTurnIndex: null,
        currentTurnIndex: nextIndex,
        consecutiveDoubles: samePlayerContinues ? state.consecutiveDoubles : 0,
      };
    });
  },
  declinePurchase: () => {
    set((state) => {
      if (!state.pendingAction || state.pendingAction.type !== "purchase") {
        return state;
      }

      const players = state.players;
      const nextIndex = state.pendingNextTurnIndex ?? ((state.currentTurnIndex + 1) % Math.max(players.length, 1));
      const samePlayerContinues = nextIndex === state.currentTurnIndex;
      return {
        ...state,
        pendingAction: null,
        pendingNextTurnIndex: null,
        currentTurnIndex: nextIndex,
        consecutiveDoubles: samePlayerContinues ? state.consecutiveDoubles : 0,
        logs: addLog(state.logs, `Purchase opportunity declined.`),
      };
    });
  },
  requestUpgrade: (tileId) => {
    set((state) => {
      if (state.pendingAction) return state;
      const activePlayer = state.players[state.currentTurnIndex];
      if (!activePlayer) return state;
      const tile = BOARD_TILES.find((item) => item.id === tileId);
      if (!tile || tile.type !== "property" || !tile.group) return state;
      const propertyMeta = state.propertyState[tileId];
      if (!propertyMeta || propertyMeta.ownerId !== activePlayer.id) return state;
      if (propertyMeta.mortgaged) return state;
      if (!ownsFullSet(activePlayer.id, tile, state.propertyState)) return state;
      if (propertyMeta.houses >= MAX_UPGRADE_LEVEL) return state;

      const nextLevel = propertyMeta.houses + 1;
      const cost = determineUpgradeCost(tile, nextLevel);
      if (cost <= 0) return state;

      return {
        ...state,
        pendingAction: {
          type: "upgrade",
          tileId,
          playerId: activePlayer.id,
          nextLevel,
          price: cost,
        },
        pendingNextTurnIndex: state.currentTurnIndex,
      };
    });
  },
  confirmUpgrade: () => {
    set((state) => {
      if (!state.pendingAction || state.pendingAction.type !== "upgrade") {
        return state;
      }

      const tile = BOARD_TILES.find((item) => item.id === state.pendingAction!.tileId);
      if (!tile) {
        return {
          ...state,
          pendingAction: null,
          pendingNextTurnIndex: null,
        };
      }

      const players = state.players.map((player) => ({ ...player }));
      const propertyState = clonePropertyState(state.propertyState);
      const upgradeMeta = propertyState[tile.id];
      if (!upgradeMeta) {
        return state;
      }

      const playerIndex = players.findIndex((player) => player.id === state.pendingAction!.playerId);
      if (playerIndex === -1) {
        return {
          ...state,
          pendingAction: null,
          pendingNextTurnIndex: null,
        };
      }

      const upgrader = players[playerIndex];
      if (upgrader.funds < state.pendingAction.price) {
        const nextLogs = addLog(state.logs, `${upgrader.name} cannot afford the upgrade.`);
        return {
          ...state,
          players,
          logs: nextLogs,
          pendingAction: null,
          pendingNextTurnIndex: null,
        };
      }

      upgrader.funds -= state.pendingAction.price;
      upgradeMeta.houses = state.pendingAction.nextLevel;

      const nextLogs = addLog(
        state.logs,
        `${upgrader.name} upgraded ${tile.name} to level ${state.pendingAction.nextLevel}.`,
      );

      return {
        ...state,
        players,
        propertyState,
        logs: nextLogs,
        pendingAction: null,
        pendingNextTurnIndex: null,
      };
    });
  },
  declineUpgrade: () =>
    set((state) => ({
      ...state,
      pendingAction: null,
      pendingNextTurnIndex: null,
    })),
  mortgageProperty: (tileId) => {
    set((state) => {
      const tile = BOARD_TILES.find((item) => item.id === tileId);
      if (!tile) return state;
      const activePlayer = state.players[state.currentTurnIndex];
      if (!activePlayer) return state;
      const propertyMeta = state.propertyState[tileId];
      if (!propertyMeta || propertyMeta.ownerId !== activePlayer.id) return state;
      if (propertyMeta.mortgaged || propertyMeta.houses > 0) return state;

      const value = getMortgageValue(tile);
      if (value <= 0) return state;

      const players = state.players.map((player, idx) =>
        idx === state.currentTurnIndex ? { ...player, funds: player.funds + value } : { ...player },
      );
      const propertyState = clonePropertyState(state.propertyState);
      propertyState[tileId].mortgaged = true;

      const logs = addLog(state.logs, `${activePlayer.name} mortgaged ${tile.name} for ${formatFunds(value)}.`);

      return {
        ...state,
        players,
        propertyState,
        logs,
      };
    });
  },
  redeemProperty: (tileId) => {
    set((state) => {
      const tile = BOARD_TILES.find((item) => item.id === tileId);
      if (!tile) return state;
      const activePlayer = state.players[state.currentTurnIndex];
      if (!activePlayer) return state;
      const propertyMeta = state.propertyState[tileId];
      if (!propertyMeta || propertyMeta.ownerId !== activePlayer.id || !propertyMeta.mortgaged) return state;

      const cost = Math.ceil(getMortgageValue(tile) * 1.1);
      if (activePlayer.funds < cost) return state;

      const players = state.players.map((player, idx) =>
        idx === state.currentTurnIndex ? { ...player, funds: player.funds - cost } : { ...player },
      );
      const propertyState = clonePropertyState(state.propertyState);
      propertyState[tileId].mortgaged = false;

      const logs = addLog(state.logs, `${activePlayer.name} redeemed ${tile.name} for ${formatFunds(cost)}.`);

      return {
        ...state,
        players,
        propertyState,
        logs,
      };
    });
  },
  sendTradeProposal: (payload) => {
    let success = false;
    set((state) => {
      if (state.pendingTrade) return state;
      const fromPlayer = state.players.find((player) => player.id === payload.fromId);
      const toPlayer = state.players.find((player) => player.id === payload.toId);
      if (!fromPlayer || !toPlayer || fromPlayer.id === toPlayer.id) {
        return state;
      }

      const giveCash = Math.max(0, Math.floor(payload.giveCash ?? 0));
      const receiveCash = Math.max(0, Math.floor(payload.receiveCash ?? 0));
      const giveTiles = uniqueArray(payload.giveTiles ?? []).filter(
        (tileId) => state.propertyState[tileId]?.ownerId === fromPlayer.id,
      );
      const receiveTiles = uniqueArray(payload.receiveTiles ?? []).filter(
        (tileId) => state.propertyState[tileId]?.ownerId === toPlayer.id,
      );

      if (giveCash === 0 && receiveCash === 0 && giveTiles.length === 0 && receiveTiles.length === 0) {
        return state;
      }

      if (fromPlayer.funds < giveCash || toPlayer.funds < receiveCash) {
        return state;
      }

      const trade: TradeProposal = {
        id: createTradeId(),
        fromId: fromPlayer.id,
        toId: toPlayer.id,
        giveCash,
        receiveCash,
        giveTiles,
        receiveTiles,
      };

      const logs = addLog(
        state.logs,
        `${fromPlayer.name} proposed a trade to ${toPlayer.name}.`,
      );

      success = true;
      return {
        ...state,
        pendingTrade: trade,
        logs,
      };
    });
    return success;
  },
  acceptTradeProposal: () => {
    let success = false;
    set((state) => {
      const trade = state.pendingTrade;
      if (!trade) return state;

      const players = state.players.map((player) => ({ ...player }));
      const propertyState = clonePropertyState(state.propertyState);

      const fromIndex = players.findIndex((player) => player.id === trade.fromId);
      const toIndex = players.findIndex((player) => player.id === trade.toId);
      if (fromIndex === -1 || toIndex === -1) {
        return { ...state, pendingTrade: null };
      }

      const fromPlayer = players[fromIndex];
      const toPlayer = players[toIndex];

      if (fromPlayer.funds < trade.giveCash || toPlayer.funds < trade.receiveCash) {
        const logs = addLog(
          state.logs,
          `Trade between ${fromPlayer.name} and ${toPlayer.name} failed due to insufficient funds.`,
        );
        return { ...state, pendingTrade: null, logs };
      }

      const validateTiles = (ids: string[], ownerId: string) =>
        ids.every((tileId) => propertyState[tileId]?.ownerId === ownerId);

      if (
        !validateTiles(trade.giveTiles, fromPlayer.id) ||
        !validateTiles(trade.receiveTiles, toPlayer.id)
      ) {
        const logs = addLog(
          state.logs,
          `Trade between ${fromPlayer.name} and ${toPlayer.name} failed because ownership changed.`,
        );
        return { ...state, pendingTrade: null, logs };
      }

      fromPlayer.funds = fromPlayer.funds - trade.giveCash + trade.receiveCash;
      toPlayer.funds = toPlayer.funds + trade.giveCash - trade.receiveCash;

      const moveTile = (tileId: string, sourceId: string, targetId: string) => {
        const tileMeta = propertyState[tileId];
        if (tileMeta && tileMeta.ownerId === sourceId) {
          tileMeta.ownerId = targetId;
        }
      };

      trade.giveTiles.forEach((tileId) => moveTile(tileId, fromPlayer.id, toPlayer.id));
      trade.receiveTiles.forEach((tileId) => moveTile(tileId, toPlayer.id, fromPlayer.id));

      const logs = addLog(
        state.logs,
        `${fromPlayer.name} and ${toPlayer.name} completed a trade.`,
      );

      success = true;
      return {
        ...state,
        players,
        propertyState,
        pendingTrade: null,
        logs,
      };
    });
    return success;
  },
  rejectTradeProposal: (initiatorId) => {
    let success = false;
    set((state) => {
      const trade = state.pendingTrade;
      if (!trade) return state;

      const initiator = initiatorId
        ? state.players.find((player) => player.id === initiatorId)
        : null;
      const fromPlayer = state.players.find((player) => player.id === trade.fromId);
      const toPlayer = state.players.find((player) => player.id === trade.toId);

      const actor = initiator ?? toPlayer ?? fromPlayer;
      const counterparty =
        actor?.id === trade.fromId ? toPlayer ?? null : fromPlayer ?? null;

      const message =
        actor?.id === trade.fromId
          ? `${actor?.name ?? "Player"} withdrew the trade offer with ${counterparty?.name ?? "opponent"}.`
          : `${actor?.name ?? "Player"} declined ${counterparty?.name ?? "the offer"}.`;

      const logs = addLog(state.logs, message);

      success = true;
      return { ...state, pendingTrade: null, logs };
    });
    return success;
  },
  placeAuctionBid: () => {},
  closeAuction: () => {},
  leaveJailByPayment: () => {},
  useJailCard: () => {},
  dismissCard: () => set(() => ({ lastCard: null })),
  reset: () =>
    set(() => ({
      players: [],
      phase: "lobby",
      playerCount: 2,
      currentTurnIndex: 0,
      lastRoll: [1, 1],
      consecutiveDoubles: 0,
      propertyState: createPropertyState(),
      pendingAction: null,
      pendingNextTurnIndex: null,
      chanceIndex: 0,
      chestIndex: 0,
      lastCard: null,
      logs: [],
      pendingTrade: null,
      auction: null,
      lastMovementPath: [],
    })),
}));
