import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  DEFAULT_GAME_CONFIG,
  createGame,
  parseBoardSize,
  selectGameViewModel,
  type CellView,
} from '../../src/contracts/game';
import { createAcceptedGame, reveal } from '../fixtures/game';

describe('public game contract', () => {
  it('publishes the agreed adjustable MVP defaults', () => {
    expect(DEFAULT_GAME_CONFIG).toEqual({
      minRows: 5,
      maxRows: 40,
      minColumns: 5,
      maxColumns: 40,
      mineRatio: { min: 0.13, max: 0.17 },
      rockRatio: 0.08,
      maxRockClusterSize: 4,
      adjacentProtectionWeights: [5, 10, 15, 20, 20, 15, 10, 5],
      maxGenerationAttempts: 200,
    });
    expect(
      DEFAULT_GAME_CONFIG.adjacentProtectionWeights.every(Number.isInteger),
    ).toBe(true);
    expect(
      DEFAULT_GAME_CONFIG.adjacentProtectionWeights.every(
        (weight) => weight > 0,
      ),
    ).toBe(true);
    expect(
      DEFAULT_GAME_CONFIG.adjacentProtectionWeights.reduce(
        (sum, weight) => sum + weight,
        0,
      ),
    ).toBe(100);
    // Contract: issue-5 section 3 — must be a positive integer, default 200.
    expect(Number.isInteger(DEFAULT_GAME_CONFIG.maxGenerationAttempts)).toBe(
      true,
    );
    expect(DEFAULT_GAME_CONFIG.maxGenerationAttempts).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ['4', '5', 'ROWS_OUT_OF_RANGE'],
    ['41', '5', 'ROWS_OUT_OF_RANGE'],
    ['5.5', '5', 'ROWS_NOT_INTEGER'],
    ['five', '5', 'ROWS_NOT_INTEGER'],
    ['5', '4', 'COLUMNS_OUT_OF_RANGE'],
    ['5', '41', 'COLUMNS_OUT_OF_RANGE'],
    ['5', '7.5', 'COLUMNS_NOT_INTEGER'],
  ])('rejects rows=%s and columns=%s with %s', (rows, columns, errorCode) => {
    const result = parseBoardSize({ rows, columns });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected board size to be rejected');
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: errorCode })]),
    );
  });

  it.each([
    ['5', '7', { rows: 5, columns: 7 }],
    ['40', '20', { rows: 40, columns: 20 }],
  ])('accepts a rectangular %sx%s board', (rows, columns, expected) => {
    expect(parseBoardSize({ rows, columns })).toEqual({
      ok: true,
      size: expected,
    });
  });

  it('rejects invalid generation settings instead of creating a partial game', () => {
    const invalidConfig = {
      ...DEFAULT_GAME_CONFIG,
      adjacentProtectionWeights: [5, 10, 15, 20, 20, 15, 10, 4] as const,
    };
    const result = createGame({
      type: 'new-game',
      size: { rows: 10, columns: 10 },
      seed: 1,
      nowMs: 0,
      config: invalidConfig,
    });
    expect(result.ok).toBe(false);
    if (result.ok)
      throw new Error('Expected invalid configuration to be rejected');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_PROTECTION_WEIGHTS',
          field: 'config',
        }),
      ]),
    );
  });

  it('does not expose a mine field on the hidden cell view union or runtime view model', () => {
    type HiddenView = Extract<
      CellView,
      { terrain: 'ground'; visibility: 'hidden' }
    >;
    expectTypeOf<HiddenView>().not.toHaveProperty('hasMine');

    const state = reveal(
      createAcceptedGame(10, 10, 829, 100),
      { row: 0, column: 0 },
      100,
    );
    const view = selectGameViewModel(state);
    for (const cell of view.cells) {
      if (cell.terrain === 'ground' && cell.visibility === 'hidden') {
        expect(cell).not.toHaveProperty('hasMine');
        expect(cell).not.toHaveProperty('content');
      }
    }
  });
});
