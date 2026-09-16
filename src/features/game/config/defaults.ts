import type { GameConfig } from '../../../contracts/game';

export const DEFAULT_GAME_CONFIG: Readonly<GameConfig> = Object.freeze({
  minRows: 5,
  maxRows: 40,
  minColumns: 5,
  maxColumns: 40,
  mineRatio: Object.freeze({ min: 0.13, max: 0.17 }),
  rockRatio: 0.08,
  maxRockClusterSize: 4,
  adjacentProtectionWeights: Object.freeze([
    5, 10, 15, 20, 20, 15, 10, 5,
  ] as const),
});
