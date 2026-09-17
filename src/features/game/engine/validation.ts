import type {
  BoardSetupInput,
  GameConfig,
  GameSetupRejected,
  BoardSize,
  NewGameAction,
  SetupValidationError,
} from '../../../contracts/game';
import { DEFAULT_GAME_CONFIG } from '../config/defaults';

export function parseBoardSize(
  input: BoardSetupInput,
  config: Readonly<GameConfig> = DEFAULT_GAME_CONFIG,
): { ok: true; size: BoardSize } | GameSetupRejected {
  const errors: SetupValidationError[] = [];
  for (const field of ['rows', 'columns'] as const) {
    const prefix = field === 'rows' ? 'ROWS' : 'COLUMNS';
    const min = field === 'rows' ? config.minRows : config.minColumns;
    const max = field === 'rows' ? config.maxRows : config.maxColumns;
    if (
      !/^\d+$/.test(input[field]) ||
      !Number.isSafeInteger(Number(input[field]))
    ) {
      errors.push({
        code: `${prefix}_NOT_INTEGER`,
        field,
        message: '행과 열은 5~40 사이의 정수여야 합니다.',
      });
    } else if (
      Number(input[field]) < min ||
      Number(input[field]) > max ||
      Number(input[field]) < 5 ||
      Number(input[field]) > 40
    ) {
      errors.push({
        code: `${prefix}_OUT_OF_RANGE`,
        field,
        message: '행과 열은 5~40 사이여야 합니다.',
      });
    }
  }
  return errors.length
    ? { ok: false, errors }
    : {
        ok: true,
        size: { rows: Number(input.rows), columns: Number(input.columns) },
      };
}

export function validateSetup(
  action: NewGameAction,
  config: Readonly<GameConfig>,
): SetupValidationError[] {
  const errors: SetupValidationError[] = [];
  const add = (
    code: SetupValidationError['code'],
    field: SetupValidationError['field'] = 'config',
  ) => errors.push({ code, field, message: '게임 설정이 유효하지 않습니다.' });
  const parsed = parseBoardSize(
    { rows: String(action.size.rows), columns: String(action.size.columns) },
    config,
  );
  if (!parsed.ok) errors.push(...parsed.errors);
  if (
    ![
      config.minRows,
      config.maxRows,
      config.minColumns,
      config.maxColumns,
    ].every(Number.isInteger) ||
    config.minRows < 5 ||
    config.maxRows > 40 ||
    config.minRows > config.maxRows
  )
    add('ROWS_OUT_OF_RANGE', 'rows');
  if (
    config.minColumns < 5 ||
    config.maxColumns > 40 ||
    config.minColumns > config.maxColumns
  )
    add('COLUMNS_OUT_OF_RANGE', 'columns');
  const { min, max } = config.mineRatio;
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min < 0 ||
    max >= 1 ||
    min > max
  )
    add('INVALID_MINE_RATIO');
  if (
    !Number.isFinite(config.rockRatio) ||
    config.rockRatio < 0 ||
    config.rockRatio >= 1
  )
    add('INVALID_ROCK_RATIO');
  if (
    !Number.isInteger(config.maxRockClusterSize) ||
    config.maxRockClusterSize < 1 ||
    config.maxRockClusterSize > 4
  )
    add('INVALID_ROCK_CLUSTER_SIZE');
  if (
    config.adjacentProtectionWeights.length !== 8 ||
    config.adjacentProtectionWeights.some(
      (w) => !Number.isInteger(w) || w <= 0,
    ) ||
    config.adjacentProtectionWeights.reduce((a, b) => a + b, 0) !== 100
  )
    add('INVALID_PROTECTION_WEIGHTS');
  if (
    !Number.isInteger(config.maxGenerationAttempts) ||
    config.maxGenerationAttempts < 1
  )
    add('INVALID_MAX_GENERATION_ATTEMPTS');
  if (
    !Number.isInteger(action.seed) ||
    action.seed < 0 ||
    action.seed > 0xffffffff
  )
    add('INVALID_SEED', 'seed');
  if (!Number.isFinite(action.nowMs) || action.nowMs < 0)
    add('INVALID_TIMESTAMP', 'nowMs');
  const playable =
    action.size.rows * action.size.columns -
    Math.round(action.size.rows * action.size.columns * config.rockRatio);
  if (playable < 1 || Math.floor(playable * max) > Math.max(0, playable - 9))
    add('INSUFFICIENT_MINE_CANDIDATES');
  return errors;
}
