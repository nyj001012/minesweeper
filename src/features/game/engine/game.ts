import type {
  AdjacentMineCount,
  Cell,
  GameAction,
  GameSetupResult,
  GameState,
  GameTransitionResult,
  IgnoredActionReason,
  NewGameAction,
  TransitionErrorCode,
} from '../../../contracts/game';
import { DEFAULT_GAME_CONFIG } from '../config/defaults';
import { validateSetup } from './validation';
import { adjacent, coordinateOf, createTerrain } from './board';
import { randomSource, shuffle } from './random';

export function createGame(action: NewGameAction): GameSetupResult {
  const supplied = action.config ?? DEFAULT_GAME_CONFIG;
  const errors = validateSetup(action, supplied);
  if (errors.length) return { ok: false, errors };
  const config = {
    ...supplied,
    mineRatio: { ...supplied.mineRatio },
    adjacentProtectionWeights: [
      ...supplied.adjacentProtectionWeights,
    ] as typeof supplied.adjacentProtectionWeights,
  };
  const size = { ...action.size };
  const random = randomSource(action.seed);
  const cells = createTerrain(
    size,
    Math.round(size.rows * size.columns * config.rockRatio),
    config.maxRockClusterSize,
    random,
  );
  if (!cells)
    return {
      ok: false,
      errors: [
        {
          code: 'INVALID_ROCK_RATIO',
          field: 'config',
          message: '돌 덩어리 제한에 맞춰 배치할 수 없습니다.',
        },
      ],
    };
  return {
    ok: true,
    state: {
      size,
      config,
      cells,
      status: 'ready',
      minesPlaced: false,
      totalMineCount: 0,
      revealedSafeCellCount: 0,
      prngState: random.state,
      placement: null,
      startedAtMs: null,
      endedAtMs: null,
      observedAtMs: action.nowMs,
    },
  };
}

function placeMines(state: GameState, index: number, nowMs: number): GameState {
  const random = randomSource(state.prngState);
  const sampledMineRatio =
    state.config.mineRatio.min +
    random.next() * (state.config.mineRatio.max - state.config.mineRatio.min);
  const mineCount = Math.floor(
    state.cells.filter((c) => c.terrain === 'ground').length * sampledMineRatio,
  );
  const draw = random.next() * 100;
  let cumulative = 0,
    requestedAdjacentProtectionCount = 8;
  for (let i = 0; i < 8; i++) {
    cumulative += state.config.adjacentProtectionWeights[i];
    if (draw < cumulative) {
      requestedAdjacentProtectionCount = i + 1;
      break;
    }
  }
  const protectedIndices = shuffle(
    adjacent(state.size, index).filter(
      (i) => state.cells[i].terrain === 'ground',
    ),
    random,
  ).slice(0, requestedAdjacentProtectionCount);
  const excluded = new Set([index, ...protectedIndices]);
  const candidates = state.cells.flatMap((c, i) =>
    c.terrain === 'ground' && !excluded.has(i) ? [i] : [],
  );
  const mines = new Set(shuffle(candidates, random).slice(0, mineCount));
  const cells: Cell[] = state.cells.map((cell, i) =>
    cell.terrain === 'rock'
      ? cell
      : {
          terrain: 'ground',
          visibility: 'hidden',
          isFlagged: cell.isFlagged,
          hasMine: mines.has(i),
          adjacentMineCount: (mines.has(i)
            ? 0
            : adjacent(state.size, i).filter((n) => mines.has(n))
                .length) as AdjacentMineCount,
        },
  );
  return {
    ...state,
    cells,
    minesPlaced: true,
    totalMineCount: mineCount,
    status: 'running',
    startedAtMs: nowMs,
    observedAtMs: nowMs,
    prngState: random.state,
    placement: {
      sampledMineRatio,
      mineCount,
      firstReveal: coordinateOf(state.size, index),
      requestedAdjacentProtectionCount,
      protectedCoordinates: protectedIndices.map((i) =>
        coordinateOf(state.size, i),
      ),
    },
  };
}

export function transitionGame(
  state: GameState,
  action: Exclude<GameAction, NewGameAction>,
): GameTransitionResult {
  const reject = (code: TransitionErrorCode): GameTransitionResult => ({
    ok: false,
    state,
    error: { code, message: '게임 상태 또는 입력을 확인해 주세요.' },
  });
  const ignore = (reason: IgnoredActionReason): GameTransitionResult => ({
    ok: true,
    changed: false,
    state,
    reason,
  });
  if (
    state.cells.length !== state.size.rows * state.size.columns ||
    (state.status === 'running' &&
      (!state.minesPlaced || state.startedAtMs === null))
  )
    return reject('STATE_INVARIANT_VIOLATION');
  if (!Number.isFinite(action.nowMs) || action.nowMs < 0)
    return reject('INVALID_ACTION_PAYLOAD');
  if (action.nowMs < state.observedAtMs) return reject('CLOCK_MOVED_BACKWARDS');
  if (action.type === 'observe-time') {
    return state.status !== 'running'
      ? ignore('TIME_OBSERVATION_WHILE_NOT_RUNNING')
      : {
          ok: true,
          changed: true,
          state: { ...state, observedAtMs: action.nowMs },
        };
  }
  if (action.type !== 'reveal-cell' && action.type !== 'toggle-flag')
    return reject('INVALID_ACTION_PAYLOAD');
  const { row, column } = action.coordinate;
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 0 ||
    column < 0 ||
    row >= state.size.rows ||
    column >= state.size.columns
  )
    return reject('COORDINATE_OUT_OF_BOUNDS');
  if (state.status === 'won' || state.status === 'lost')
    return ignore('GAME_ALREADY_FINISHED');
  const index = row * state.size.columns + column;
  const cell = state.cells[index];
  if (cell.terrain === 'rock') return ignore('ROCK_CELL');
  if (cell.visibility === 'revealed') return ignore('REVEALED_CELL');
  if (action.type === 'toggle-flag') {
    const cells = [...state.cells];
    cells[index] = { ...cell, isFlagged: !cell.isFlagged };
    return {
      ok: true,
      changed: true,
      state: { ...state, cells, observedAtMs: action.nowMs },
    };
  }
  if (cell.isFlagged) return ignore('FLAGGED_CELL');
  const running = state.minesPlaced
    ? state
    : placeMines(state, index, action.nowMs);
  const cells = [...running.cells];
  const clicked = cells[index];
  if (clicked.terrain === 'ground' && clicked.hasMine) {
    cells[index] = {
      terrain: 'ground',
      visibility: 'revealed',
      hasMine: true,
      isFlagged: false,
      adjacentMineCount: 0,
      isExploded: true,
    };
    return {
      ok: true,
      changed: true,
      state: {
        ...running,
        cells,
        status: 'lost',
        endedAtMs: action.nowMs,
        observedAtMs: action.nowMs,
      },
    };
  }
  const queue = [index],
    visited = new Set([index]);
  let revealed = running.revealedSafeCellCount;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor],
      candidate = cells[current];
    if (
      candidate.terrain === 'rock' ||
      candidate.hasMine ||
      candidate.isFlagged ||
      candidate.visibility === 'revealed'
    )
      continue;
    cells[current] = {
      terrain: 'ground',
      visibility: 'revealed',
      hasMine: false,
      isFlagged: false,
      adjacentMineCount: candidate.adjacentMineCount,
      isExploded: false,
    };
    revealed++;
    if (candidate.adjacentMineCount === 0)
      for (const next of adjacent(state.size, current)) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
  }
  const won =
    revealed ===
    cells.filter((c) => c.terrain === 'ground' && !c.hasMine).length;
  return {
    ok: true,
    changed: true,
    state: {
      ...running,
      cells,
      revealedSafeCellCount: revealed,
      status: won ? 'won' : 'running',
      endedAtMs: won ? action.nowMs : null,
      observedAtMs: action.nowMs,
    },
  };
}
