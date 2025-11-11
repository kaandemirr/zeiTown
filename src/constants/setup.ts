export const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

export type TokenDefinition = {
  id: string;
  image: string;
  labelKey: string;
};

export const TOKEN_OPTIONS: TokenDefinition[] = [
  {
    id: "tesla-coil",
    image: "/assets/tokens/tesla-coil.png",
    labelKey: "token.teslaCoil",
  },
  {
    id: "honey-badger",
    image: "/assets/tokens/honey-badger.png",
    labelKey: "token.honeyBadger",
  },
  { id: "tractor", image: "/assets/tokens/tractor.png", labelKey: "token.tractor" },
  { id: "orca", image: "/assets/tokens/orca.png", labelKey: "token.orca" },
  { id: "dog", image: "/assets/tokens/dog.png", labelKey: "token.dog" },
  { id: "pig", image: "/assets/tokens/pig.png", labelKey: "token.pig" },
  { id: "bear", image: "/assets/tokens/bear.png", labelKey: "token.bear" },
  { id: "frog", image: "/assets/tokens/frog.png", labelKey: "token.frog" },
];

export const TOKEN_LOOKUP: Record<string, TokenDefinition> = TOKEN_OPTIONS.reduce(
  (acc, token) => {
    acc[token.id] = token;
    return acc;
  },
  {} as Record<string, TokenDefinition>,
);

export const getTokenDefinition = (id: string) => TOKEN_LOOKUP[id];
