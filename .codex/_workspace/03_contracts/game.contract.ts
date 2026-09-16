/**
 * Island Minesweeper MVP public domain contract.
 *
 * Phase 3 must materialize this contract at `src/contracts/game.ts`. This file
 * intentionally contains declarations only; it does not contain game logic.
 */

export type RowCount = number;
export type ColumnCount = number;
export type TimestampMs = number;
export type Uint32Seed = number;

export interface BoardSize {
  readonly rows: RowCount;
  readonly columns: ColumnCount;
}

/** Zero-based engine coordinate. User-facing labels are one-based. */
export interface Coordinate {
  readonly row: number;
  readonly column: number;
}

export interface RatioRange {
  readonly min: number;
  readonly max: number;
}

/** Index 0..7 maps to protecting 1..8 adjacent playable cells. */
export type AdjacentProtectionWeights = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface GameConfig {
  readonly minRows: number;
  readonly maxRows: number;
  readonly minColumns: number;
  readonly maxColumns: number;
  readonly mineRatio: RatioRange;
  readonly rockRatio: number;
  readonly maxRockClusterSize: number;
  readonly adjacentProtectionWeights: AdjacentProtectionWeights;
}

/**
 * Runtime value to be implemented in `src/contracts/game.ts`.
 * Weights total 100 and represent [5, 10, 15, 20, 20, 15, 10, 5].
 */
export declare const DEFAULT_GAME_CONFIG: Readonly<GameConfig>;

export type AdjacentMineCount = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type GroundVisibility = 'hidden' | 'revealed';

export interface HiddenGroundCell {
  readonly terrain: 'ground';
  readonly visibility: 'hidden';
  readonly hasMine: boolean;
  readonly isFlagged: boolean;
  readonly adjacentMineCount: AdjacentMineCount;
}

export interface RevealedSafeCell {
  readonly terrain: 'ground';
  readonly visibility: 'revealed';
  readonly hasMine: false;
  readonly isFlagged: false;
  readonly adjacentMineCount: AdjacentMineCount;
  readonly isExploded: false;
}

export interface RevealedMineCell {
  readonly terrain: 'ground';
  readonly visibility: 'revealed';
  readonly hasMine: true;
  readonly isFlagged: false;
  readonly adjacentMineCount: 0;
  readonly isExploded: boolean;
}

/** Rocks cannot carry mine, visibility, flag, or adjacent-count state. */
export interface RockCell {
  readonly terrain: 'rock';
}

export type GroundCell = HiddenGroundCell | RevealedSafeCell | RevealedMineCell;
export type Cell = GroundCell | RockCell;
export type GameStatus = 'ready' | 'running' | 'won' | 'lost';

export interface MinePlacementRecord {
  /** Uniformly sampled value from the configured closed interval. */
  readonly sampledMineRatio: number;
  /** floor(playable cell count * sampledMineRatio). */
  readonly mineCount: number;
  readonly firstReveal: Coordinate;
  /** Weighted sample in the range 1..8. */
  readonly requestedAdjacentProtectionCount: number;
  /** May be shorter at an edge or where rocks remove candidates. */
  readonly protectedCoordinates: readonly Coordinate[];
}

/** Aggregate root. Cells use row-major indexing: row * columns + column. */
export interface GameState {
  readonly size: BoardSize;
  readonly config: Readonly<GameConfig>;
  readonly cells: readonly Cell[];
  readonly status: GameStatus;
  readonly minesPlaced: boolean;
  readonly totalMineCount: number;
  readonly revealedSafeCellCount: number;
  readonly prngState: Uint32Seed;
  readonly placement: MinePlacementRecord | null;
  readonly startedAtMs: TimestampMs | null;
  readonly endedAtMs: TimestampMs | null;
  /** Latest clock observation; never used as accumulated interval state. */
  readonly observedAtMs: TimestampMs;
}

export interface NewGameAction {
  readonly type: 'new-game';
  readonly size: BoardSize;
  readonly seed: Uint32Seed;
  readonly nowMs: TimestampMs;
  readonly config?: Readonly<GameConfig>;
}

export interface RevealCellAction {
  readonly type: 'reveal-cell';
  readonly coordinate: Coordinate;
  readonly nowMs: TimestampMs;
}

export interface ToggleFlagAction {
  readonly type: 'toggle-flag';
  readonly coordinate: Coordinate;
  readonly nowMs: TimestampMs;
}

export interface ObserveTimeAction {
  readonly type: 'observe-time';
  readonly nowMs: TimestampMs;
}

export type GameAction =
  | NewGameAction
  | RevealCellAction
  | ToggleFlagAction
  | ObserveTimeAction;

export type SetupErrorCode =
  | 'ROWS_NOT_INTEGER'
  | 'ROWS_OUT_OF_RANGE'
  | 'COLUMNS_NOT_INTEGER'
  | 'COLUMNS_OUT_OF_RANGE'
  | 'INVALID_MINE_RATIO'
  | 'INVALID_ROCK_RATIO'
  | 'INVALID_ROCK_CLUSTER_SIZE'
  | 'INVALID_PROTECTION_WEIGHTS'
  | 'INSUFFICIENT_MINE_CANDIDATES'
  | 'INVALID_SEED'
  | 'INVALID_TIMESTAMP';

export interface SetupValidationError {
  readonly code: SetupErrorCode;
  readonly field: 'rows' | 'columns' | 'config' | 'seed' | 'nowMs';
  readonly message: string;
}

export interface GameSetupRejected {
  readonly ok: false;
  readonly errors: readonly SetupValidationError[];
}

export interface GameSetupAccepted {
  readonly ok: true;
  readonly state: GameState;
}

export type GameSetupResult = GameSetupAccepted | GameSetupRejected;

export type IgnoredActionReason =
  | 'GAME_ALREADY_FINISHED'
  | 'ROCK_CELL'
  | 'FLAGGED_CELL'
  | 'REVEALED_CELL'
  | 'TIME_OBSERVATION_WHILE_NOT_RUNNING';

export type TransitionErrorCode =
  | 'COORDINATE_OUT_OF_BOUNDS'
  | 'CLOCK_MOVED_BACKWARDS'
  | 'INVALID_ACTION_PAYLOAD'
  | 'STATE_INVARIANT_VIOLATION';

export interface GameTransitionApplied {
  readonly ok: true;
  readonly changed: true;
  readonly state: GameState;
}

export interface GameTransitionIgnored {
  readonly ok: true;
  readonly changed: false;
  readonly state: GameState;
  readonly reason: IgnoredActionReason;
}

export interface GameTransitionRejected {
  readonly ok: false;
  readonly state: GameState;
  readonly error: {
    readonly code: TransitionErrorCode;
    readonly message: string;
  };
}

export type GameTransitionResult =
  | GameTransitionApplied
  | GameTransitionIgnored
  | GameTransitionRejected;

/** UI-safe cell variants. Hidden cells never expose mine placement. */
export type CellView =
  | {
      readonly terrain: 'rock';
      readonly coordinate: Coordinate;
      readonly interaction: 'disabled';
    }
  | {
      readonly terrain: 'ground';
      readonly coordinate: Coordinate;
      readonly visibility: 'hidden';
      readonly isFlagged: boolean;
      readonly interaction: 'enabled' | 'disabled';
    }
  | {
      readonly terrain: 'ground';
      readonly coordinate: Coordinate;
      readonly visibility: 'revealed';
      readonly content: 'safe';
      readonly adjacentMineCount: AdjacentMineCount;
      readonly interaction: 'disabled';
    }
  | {
      readonly terrain: 'ground';
      readonly coordinate: Coordinate;
      readonly visibility: 'revealed';
      readonly content: 'mine';
      readonly isExploded: boolean;
      readonly interaction: 'disabled';
    };

export interface GameViewModel {
  readonly size: BoardSize;
  readonly status: GameStatus;
  readonly cells: readonly CellView[];
  readonly elapsedSeconds: number;
  readonly totalMineCount: number | null;
  readonly flagCount: number;
  readonly statusAnnouncement: string;
}

export interface BoardSetupInput {
  readonly rows: string;
  readonly columns: string;
}

export interface BoardSetupViewModel {
  readonly input: BoardSetupInput;
  readonly errors: readonly SetupValidationError[];
  readonly canSubmit: boolean;
}

/** Pure engine boundary. */
export declare function createGame(action: NewGameAction): GameSetupResult;
export declare function transitionGame(
  state: GameState,
  action: Exclude<GameAction, NewGameAction>,
): GameTransitionResult;

/** Selector boundary. It must strip hidden mine data. */
export declare function selectGameViewModel(state: GameState): GameViewModel;
export declare function getElapsedSeconds(state: GameState): number;

/** Form/application boundary. Parsing is decimal-only and rejects fractions. */
export declare function parseBoardSize(
  input: BoardSetupInput,
  config?: Readonly<GameConfig>,
): { readonly ok: true; readonly size: BoardSize } | GameSetupRejected;

