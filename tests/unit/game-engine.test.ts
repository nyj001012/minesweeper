import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAME_CONFIG,
  createGame,
  getElapsedSeconds,
  selectGameViewModel,
  transitionGame,
  type Coordinate,
  type GameState,
} from '../../src/contracts/game';
import {
  applyTransition,
  coordinateOf,
  createAcceptedGame,
  indexOf,
  neighbors,
  reveal,
} from '../fixtures/game';

function rockComponents(state: GameState): number[] {
  const pending = new Set(
    state.cells.flatMap((cell, index) =>
      cell.terrain === 'rock' ? [index] : [],
    ),
  );
  const sizes: number[] = [];
  while (pending.size > 0) {
    const start = pending.values().next().value as number;
    pending.delete(start);
    const queue = [start];
    let size = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      size += 1;
      const { row, column } = coordinateOf(state, current);
      for (const candidate of [
        { row: row - 1, column },
        { row: row + 1, column },
        { row, column: column - 1 },
        { row, column: column + 1 },
      ]) {
        if (
          candidate.row < 0 ||
          candidate.row >= state.size.rows ||
          candidate.column < 0 ||
          candidate.column >= state.size.columns
        ) {
          continue;
        }
        const index = indexOf(state, candidate);
        if (pending.delete(index)) queue.push(index);
      }
    }
    sizes.push(size);
  }
  return sizes;
}

function expectedFlood(state: GameState, start: Coordinate): Set<number> {
  const expected = new Set<number>();
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentIndex = indexOf(state, current);
    if (expected.has(currentIndex)) continue;
    const cell = state.cells[currentIndex];
    if (cell.terrain === 'rock' || cell.hasMine || cell.isFlagged) continue;
    expected.add(currentIndex);
    if (cell.adjacentMineCount === 0) {
      queue.push(...neighbors(state, current));
    }
  }
  return expected;
}

describe('game generation', () => {
  it.each([
    [5, 7, 11],
    [10, 10, 2026],
    [40, 20, 0xffff_ffff],
  ])(
    'creates exactly 8%% rocks with connected components of at most four on %ix%i',
    (rows, columns, seed) => {
      const state = createAcceptedGame(rows, columns, seed);
      const rocks = state.cells.filter((cell) => cell.terrain === 'rock');
      expect(rocks).toHaveLength(
        Math.round(rows * columns * DEFAULT_GAME_CONFIG.rockRatio),
      );
      expect(Math.max(...rockComponents(state))).toBeLessThanOrEqual(
        DEFAULT_GAME_CONFIG.maxRockClusterSize,
      );
      expect(rocks.every((cell) => Object.keys(cell).length === 1)).toBe(true);
    },
  );

  it('is reproducible for a fixed seed and defers mines until the first valid reveal', () => {
    const first = createAcceptedGame(12, 9, 123456, 500);
    const second = createAcceptedGame(12, 9, 123456, 500);
    expect(second).toEqual(first);
    expect(first.minesPlaced).toBe(false);
    expect(first.totalMineCount).toBe(0);
    expect(
      first.cells.every((cell) => cell.terrain === 'rock' || !cell.hasMine),
    ).toBe(true);

    const firstPlayableIndex = first.cells.findIndex(
      (cell) => cell.terrain === 'ground',
    );
    expect(reveal(first, coordinateOf(first, firstPlayableIndex), 500)).toEqual(
      reveal(second, coordinateOf(second, firstPlayableIndex), 500),
    );
  });

  it('places 13-17% mines after protecting the first click and weighted adjacent sample', () => {
    for (const seed of [1, 17, 829, 65_537, 0xffff_fffe]) {
      const initial = createAcceptedGame(20, 17, seed, 1_000);
      const clickedIndex = initial.cells.findIndex(
        (cell) => cell.terrain === 'ground',
      );
      const clicked = coordinateOf(initial, clickedIndex);
      const state = reveal(initial, clicked, 1_000);
      expect(state.placement).not.toBeNull();
      const placement = state.placement!;
      const playableCount = state.cells.filter(
        (cell) => cell.terrain === 'ground',
      ).length;
      expect(placement.sampledMineRatio).toBeGreaterThanOrEqual(0.13);
      expect(placement.sampledMineRatio).toBeLessThanOrEqual(0.17);
      expect(state.totalMineCount).toBe(
        Math.floor(playableCount * placement.sampledMineRatio),
      );
      expect(
        state.cells.filter((cell) => cell.terrain === 'ground' && cell.hasMine),
      ).toHaveLength(state.totalMineCount);
      expect(state.cells[indexOf(state, clicked)]).toMatchObject({
        hasMine: false,
      });
      expect(placement.requestedAdjacentProtectionCount).toBeGreaterThanOrEqual(
        1,
      );
      expect(placement.requestedAdjacentProtectionCount).toBeLessThanOrEqual(8);
      expect(
        new Set(
          placement.protectedCoordinates.map(
            (item) => `${item.row}:${item.column}`,
          ),
        ).size,
      ).toBe(placement.protectedCoordinates.length);
      for (const protectedCoordinate of placement.protectedCoordinates) {
        expect(neighbors(state, clicked)).toContainEqual(protectedCoordinate);
        expect(state.cells[indexOf(state, protectedCoordinate)]).toMatchObject({
          terrain: 'ground',
          hasMine: false,
        });
      }
    }
  });

  it('records a guaranteedNoGuess placement for typical boards under the default attempt budget', () => {
    // Contract: issue-5 section 4/6 — most ordinary boards should be fully
    // solvable by `solveBoard` well within the default 200-attempt budget,
    // so `placement.guaranteedNoGuess` should be true for the large
    // majority of seeds. This is a statistical regression guard (not every
    // seed is guaranteed solvable) rather than an absolute assertion.
    let guaranteed = 0;
    const seeds = Array.from({ length: 20 }, (_, index) => index + 1);
    for (const seed of seeds) {
      const initial = createAcceptedGame(10, 10, seed, 0);
      const firstIndex = initial.cells.findIndex(
        (cell) => cell.terrain === 'ground',
      );
      const state = reveal(initial, coordinateOf(initial, firstIndex), 0);
      expect(state.placement).not.toBeNull();
      const placement = state.placement!;
      expect(placement.attemptsUsed).toBeGreaterThanOrEqual(1);
      expect(placement.attemptsUsed).toBeLessThanOrEqual(
        state.config.maxGenerationAttempts,
      );
      if (placement.guaranteedNoGuess) guaranteed += 1;
    }
    expect(guaranteed).toBeGreaterThanOrEqual(Math.ceil(seeds.length * 0.8));
  });

  it('never throws and still produces a fully playable board when the attempt budget is exhausted', () => {
    // Contract: issue-5 section 4 fallback tie-break policy — forcing
    // maxGenerationAttempts to 1 makes it likely (though not certain per
    // seed) that at least some seeds exhaust the budget and fall back to
    // the best-effort candidate. Regardless of outcome, game creation must
    // never throw and the resulting board must remain fully playable.
    let sawFallback = false;
    for (let seed = 1; seed <= 25; seed += 1) {
      const result = createGame({
        type: 'new-game',
        size: { rows: 12, columns: 12 },
        seed,
        nowMs: 0,
        config: { ...DEFAULT_GAME_CONFIG, maxGenerationAttempts: 1 },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const initial = result.state;
      const firstIndex = initial.cells.findIndex(
        (cell) => cell.terrain === 'ground',
      );
      const state = reveal(initial, coordinateOf(initial, firstIndex), 0);
      expect(state.placement).not.toBeNull();
      const placement = state.placement!;
      expect(placement.attemptsUsed).toBe(1);
      expect(state.totalMineCount).toBeGreaterThan(0);
      expect(
        state.cells.filter((cell) => cell.terrain === 'ground' && cell.hasMine),
      ).toHaveLength(state.totalMineCount);
      if (!placement.guaranteedNoGuess) sawFallback = true;
    }
    expect(sawFallback).toBe(true);
  });

  it('produces byte-for-byte identical placement metadata (including guaranteedNoGuess/attemptsUsed) for a repeated seed', () => {
    const first = reveal(
      createAcceptedGame(10, 10, 4242, 0),
      { row: 0, column: 0 },
      0,
    );
    const second = reveal(
      createAcceptedGame(10, 10, 4242, 0),
      { row: 0, column: 0 },
      0,
    );
    expect(second).toEqual(first);
    expect(second.placement?.guaranteedNoGuess).toBe(
      first.placement?.guaranteedNoGuess,
    );
    expect(second.placement?.attemptsUsed).toBe(first.placement?.attemptsUsed);
  });

  it('leaves first-click protection, rock generation, and mine ratio sampling unaffected by the new generate-and-check loop', () => {
    // Regression guard: the no-guess retry loop (issue-5) must not alter
    // the existing protection/ratio/rock invariants already covered above
    // — it only decides *which* otherwise-valid candidate is kept.
    const initial = createAcceptedGame(20, 17, 829, 1_000);
    const clickedIndex = initial.cells.findIndex(
      (cell) => cell.terrain === 'ground',
    );
    const clicked = coordinateOf(initial, clickedIndex);
    const state = reveal(initial, clicked, 1_000);
    expect(state.cells[indexOf(state, clicked)]).toMatchObject({
      hasMine: false,
    });
    expect(state.placement).not.toBeNull();
    const placement = state.placement!;
    expect(placement.sampledMineRatio).toBeGreaterThanOrEqual(0.13);
    expect(placement.sampledMineRatio).toBeLessThanOrEqual(0.17);
    for (const protectedCoordinate of placement.protectedCoordinates) {
      expect(state.cells[indexOf(state, protectedCoordinate)]).toMatchObject({
        terrain: 'ground',
        hasMine: false,
      });
    }
    const rocks = state.cells.filter((cell) => cell.terrain === 'rock');
    expect(rocks).toHaveLength(
      Math.round(20 * 17 * DEFAULT_GAME_CONFIG.rockRatio),
    );
  });

  it('uses all weighted protection buckets across a deterministic seed sweep', () => {
    const observed = new Set<number>();
    for (let seed = 0; seed < 4_096 && observed.size < 8; seed += 1) {
      const initial = createAcceptedGame(8, 8, seed);
      const center = { row: 3, column: 3 };
      if (initial.cells[indexOf(initial, center)].terrain === 'rock') continue;
      const state = reveal(initial, center);
      observed.add(state.placement!.requestedAdjacentProtectionCount);
    }
    expect([...observed].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });
});

describe('game transitions', () => {
  it('treats rock reveal and flag actions as no-op and does not start the timer', () => {
    const state = createAcceptedGame(10, 10, 93, 200);
    const rock = coordinateOf(
      state,
      state.cells.findIndex((cell) => cell.terrain === 'rock'),
    );
    for (const action of [
      { type: 'reveal-cell' as const, coordinate: rock, nowMs: 300 },
      { type: 'toggle-flag' as const, coordinate: rock, nowMs: 300 },
    ]) {
      const result = transitionGame(state, action);
      expect(result).toMatchObject({
        ok: true,
        changed: false,
        reason: 'ROCK_CELL',
      });
      expect(result.state).toBe(state);
      expect(result.state.startedAtMs).toBeNull();
    }
  });

  it('starts at zero seconds on first reveal and derives elapsed seconds from timestamps', () => {
    const initial = createAcceptedGame(10, 10, 44, 10_000);
    const playable = coordinateOf(
      initial,
      initial.cells.findIndex((cell) => cell.terrain === 'ground'),
    );
    let state = reveal(initial, playable, 12_345);
    expect(state.startedAtMs).toBe(12_345);
    expect(getElapsedSeconds(state)).toBe(0);
    expect(selectGameViewModel(state).elapsedSeconds).toBe(0);

    state = applyTransition(
      transitionGame(state, { type: 'observe-time', nowMs: 14_999 }),
    );
    expect(getElapsedSeconds(state)).toBe(2);
  });

  it('toggles flags only on hidden ground and blocks a flagged reveal', () => {
    const initial = createAcceptedGame(10, 10, 21);
    const playable = coordinateOf(
      initial,
      initial.cells.findIndex((cell) => cell.terrain === 'ground'),
    );
    const flagged = applyTransition(
      transitionGame(initial, {
        type: 'toggle-flag',
        coordinate: playable,
        nowMs: 1,
      }),
    );
    expect(flagged.cells[indexOf(flagged, playable)]).toMatchObject({
      isFlagged: true,
    });
    const revealResult = transitionGame(flagged, {
      type: 'reveal-cell',
      coordinate: playable,
      nowMs: 2,
    });
    expect(revealResult).toMatchObject({
      ok: true,
      changed: false,
      reason: 'FLAGGED_CELL',
    });
    expect(revealResult.state.startedAtMs).toBeNull();
  });

  it('counts only adjacent mines and reveals exactly the independent BFS result', () => {
    const initial = createAcceptedGame(16, 16, 8181);
    const start = coordinateOf(
      initial,
      initial.cells.findIndex((cell) => cell.terrain === 'ground'),
    );
    const state = reveal(initial, start, 10);

    state.cells.forEach((cell, index) => {
      if (cell.terrain === 'rock' || cell.hasMine) return;
      const adjacentMines = neighbors(state, coordinateOf(state, index)).filter(
        (coordinate) => {
          const neighbor = state.cells[indexOf(state, coordinate)];
          return neighbor.terrain === 'ground' && neighbor.hasMine;
        },
      ).length;
      expect(cell.adjacentMineCount).toBe(adjacentMines);
    });

    const expected = expectedFlood(state, start);
    const actuallyRevealed = new Set(
      state.cells.flatMap((cell, index) =>
        cell.terrain === 'ground' &&
        cell.visibility === 'revealed' &&
        !cell.hasMine
          ? [index]
          : [],
      ),
    );
    expect(actuallyRevealed).toEqual(expected);
    expect(state.cells.filter((cell) => cell.terrain === 'rock')).toHaveLength(
      Math.round(16 * 16 * DEFAULT_GAME_CONFIG.rockRatio),
    );
  });

  it('freezes a loss and ignores reveal/flag actions after the game ends', () => {
    const initial = createAcceptedGame(12, 12, 307, 0);
    const safe = coordinateOf(
      initial,
      initial.cells.findIndex((cell) => cell.terrain === 'ground'),
    );
    const running = reveal(initial, safe, 1_000);
    const mine = coordinateOf(
      running,
      running.cells.findIndex(
        (cell) => cell.terrain === 'ground' && cell.hasMine,
      ),
    );
    const lost = reveal(running, mine, 2_500);
    expect(lost.status).toBe('lost');
    expect(lost.endedAtMs).toBe(2_500);
    expect(getElapsedSeconds(lost)).toBe(1);

    for (const action of [
      { type: 'reveal-cell' as const, coordinate: safe, nowMs: 99_000 },
      { type: 'toggle-flag' as const, coordinate: safe, nowMs: 99_000 },
    ]) {
      expect(transitionGame(lost, action)).toMatchObject({
        ok: true,
        changed: false,
        reason: 'GAME_ALREADY_FINISHED',
        state: lost,
      });
    }
  });

  it('reveals every remaining mine on loss, marking only the clicked one as exploded and clearing any flag', () => {
    const initial = createAcceptedGame(12, 12, 307, 0);
    const safe = coordinateOf(
      initial,
      initial.cells.findIndex((cell) => cell.terrain === 'ground'),
    );
    const running = reveal(initial, safe, 1_000);

    const mineIndexes = running.cells.flatMap((cell, index) =>
      cell.terrain === 'ground' && cell.hasMine ? [index] : [],
    );
    expect(mineIndexes.length).toBeGreaterThan(1);

    const [clickedIndex, flaggedIndex] = mineIndexes;
    const flaggedState = applyTransition(
      transitionGame(running, {
        type: 'toggle-flag',
        coordinate: coordinateOf(running, flaggedIndex),
        nowMs: 1_500,
      }),
    );

    const lost = reveal(
      flaggedState,
      coordinateOf(flaggedState, clickedIndex),
      2_500,
    );

    expect(lost.status).toBe('lost');
    for (const index of mineIndexes) {
      expect(lost.cells[index]).toMatchObject({
        terrain: 'ground',
        visibility: 'revealed',
        hasMine: true,
        isFlagged: false,
        adjacentMineCount: 0,
        isExploded: index === clickedIndex,
      });
    }
  });

  it('wins when every non-mine ground cell is open regardless of wrong flags', () => {
    const initial = createAcceptedGame(5, 5, 712, 0);
    const first = coordinateOf(
      initial,
      initial.cells.findIndex((cell) => cell.terrain === 'ground'),
    );
    let state = reveal(initial, first, 10);
    const mineIndex = state.cells.findIndex(
      (cell) =>
        cell.terrain === 'ground' &&
        cell.hasMine &&
        cell.visibility === 'hidden',
    );
    if (mineIndex >= 0) {
      state = applyTransition(
        transitionGame(state, {
          type: 'toggle-flag',
          coordinate: coordinateOf(state, mineIndex),
          nowMs: 11,
        }),
      );
    }
    for (
      let index = 0;
      index < state.cells.length && state.status === 'running';
      index += 1
    ) {
      const cell = state.cells[index];
      if (
        cell.terrain === 'ground' &&
        !cell.hasMine &&
        cell.visibility === 'hidden'
      ) {
        state = reveal(state, coordinateOf(state, index), 20 + index);
      }
    }
    expect(state.status).toBe('won');
    expect(state.endedAtMs).not.toBeNull();
  });
});
