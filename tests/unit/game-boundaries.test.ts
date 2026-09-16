import { describe, expect, it } from 'vitest';

import {
  createGame,
  DEFAULT_GAME_CONFIG,
  transitionGame,
  type GameConfig,
} from '../../src/contracts/game';
import { coordinateOf, createAcceptedGame, reveal } from '../fixtures/game';

describe('setup validation boundaries', () => {
  it.each([-1, 0x1_0000_0000, 0.5, NaN, Infinity])(
    'rejects invalid uint32 seed %s',
    (seed) => {
      const result = createGame({
        type: 'new-game',
        size: { rows: 5, columns: 5 },
        seed,
        nowMs: 0,
      });
      expect(result).toMatchObject({
        ok: false,
        errors: expect.arrayContaining([
          expect.objectContaining({ code: 'INVALID_SEED' }),
        ]),
      });
    },
  );

  it.each([-1, NaN, Infinity])('rejects invalid timestamp %s', (nowMs) => {
    const result = createGame({
      type: 'new-game',
      size: { rows: 5, columns: 5 },
      seed: 1,
      nowMs,
    });
    expect(result).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_TIMESTAMP' }),
      ]),
    });
  });

  const invalidConfigs: [Partial<GameConfig>, string][] = [
    [{ mineRatio: { min: -0.1, max: 0.17 } }, 'INVALID_MINE_RATIO'],
    [{ mineRatio: { min: 0.17, max: 0.13 } }, 'INVALID_MINE_RATIO'],
    [{ mineRatio: { min: 0.13, max: 1.1 } }, 'INVALID_MINE_RATIO'],
    [{ rockRatio: -0.1 }, 'INVALID_ROCK_RATIO'],
    [{ rockRatio: 1.1 }, 'INVALID_ROCK_RATIO'],
    [{ maxRockClusterSize: 0 }, 'INVALID_ROCK_CLUSTER_SIZE'],
    [{ maxRockClusterSize: 1.5 }, 'INVALID_ROCK_CLUSTER_SIZE'],
    [
      { adjacentProtectionWeights: [0, 15, 15, 20, 20, 15, 10, 5] },
      'INVALID_PROTECTION_WEIGHTS',
    ],
    [
      { adjacentProtectionWeights: [5.5, 9.5, 15, 20, 20, 15, 10, 5] },
      'INVALID_PROTECTION_WEIGHTS',
    ],
    [{ mineRatio: { min: 0.99, max: 0.99 } }, 'INSUFFICIENT_MINE_CANDIDATES'],
  ];

  it.each(invalidConfigs)('rejects config %j with %s', (override, code) => {
    const result = createGame({
      type: 'new-game',
      size: { rows: 5, columns: 5 },
      seed: 1,
      nowMs: 0,
      config: { ...DEFAULT_GAME_CONFIG, ...override },
    });
    expect(result).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.objectContaining({ code })]),
    });
  });
});

describe('transition rejection and no-op boundaries', () => {
  it.each([-1, NaN, Infinity])(
    'rejects invalid action time %s without changing state',
    (nowMs) => {
      const state = createAcceptedGame();
      const result = transitionGame(state, { type: 'observe-time', nowMs });
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INVALID_ACTION_PAYLOAD' },
      });
      expect(result.state).toBe(state);
    },
  );

  it('rejects a backwards clock without changing the aggregate', () => {
    const state = createAcceptedGame(10, 10, 1, 1000);
    const result = transitionGame(state, { type: 'observe-time', nowMs: 999 });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'CLOCK_MOVED_BACKWARDS' },
    });
    expect(result.state).toBe(state);
  });

  it.each([
    { row: -1, column: 0 },
    { row: 10, column: 0 },
    { row: 0, column: -1 },
    { row: 0, column: 10 },
    { row: 0.5, column: 0 },
    { row: 0, column: NaN },
  ])('rejects invalid coordinate %j for both mouse actions', (coordinate) => {
    const state = createAcceptedGame();
    for (const type of ['reveal-cell', 'toggle-flag'] as const) {
      const result = transitionGame(state, { type, coordinate, nowMs: 0 });
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'COORDINATE_OUT_OF_BOUNDS' },
      });
      expect(result.state).toBe(state);
    }
  });

  it('ignores clock observations before starting and mouse actions on revealed cells', () => {
    const initial = createAcceptedGame();
    expect(
      transitionGame(initial, { type: 'observe-time', nowMs: 100 }),
    ).toMatchObject({
      ok: true,
      changed: false,
      reason: 'TIME_OBSERVATION_WHILE_NOT_RUNNING',
      state: initial,
    });
    const coordinate = coordinateOf(
      initial,
      initial.cells.findIndex((cell) => cell.terrain === 'ground'),
    );
    const state = reveal(initial, coordinate, 100);
    for (const type of ['reveal-cell', 'toggle-flag'] as const) {
      expect(
        transitionGame(state, { type, coordinate, nowMs: 100 }),
      ).toMatchObject({
        ok: true,
        changed: false,
        reason: 'REVEALED_CELL',
        state,
      });
    }
  });
});
