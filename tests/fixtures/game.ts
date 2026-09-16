import { expect } from 'vitest';

import {
  createGame,
  transitionGame,
  type Coordinate,
  type GameState,
  type GameTransitionResult,
} from '../../src/contracts/game';

export function createAcceptedGame(
  rows = 10,
  columns = 10,
  seed = 1,
  nowMs = 0,
): GameState {
  const result = createGame({
    type: 'new-game',
    size: { rows, columns },
    seed,
    nowMs,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected game setup to succeed');
  return result.state;
}

export function applyTransition(result: GameTransitionResult): GameState {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected transition to succeed: ${result.error.code}`);
  return result.state;
}

export function reveal(
  state: GameState,
  coordinate: Coordinate,
  nowMs = 0,
): GameState {
  return applyTransition(
    transitionGame(state, { type: 'reveal-cell', coordinate, nowMs }),
  );
}

export function indexOf(state: GameState, coordinate: Coordinate): number {
  return coordinate.row * state.size.columns + coordinate.column;
}

export function coordinateOf(state: GameState, index: number): Coordinate {
  return {
    row: Math.floor(index / state.size.columns),
    column: index % state.size.columns,
  };
}

export function neighbors(state: GameState, coordinate: Coordinate): Coordinate[] {
  const result: Coordinate[] = [];
  for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
    for (let columnDelta = -1; columnDelta <= 1; columnDelta += 1) {
      if (rowDelta === 0 && columnDelta === 0) continue;
      const row = coordinate.row + rowDelta;
      const column = coordinate.column + columnDelta;
      if (
        row >= 0 &&
        row < state.size.rows &&
        column >= 0 &&
        column < state.size.columns
      ) {
        result.push({ row, column });
      }
    }
  }
  return result;
}

