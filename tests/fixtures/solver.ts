import type {
  AdjacentMineCount,
  Cell,
  Coordinate,
  SolverInput,
} from '../../src/contracts/game';

/**
 * Builds a `SolverInput` from a small ASCII layout for solver fixtures.
 *
 * Layout legend:
 * - `M` — a mine (ground truth; `hasMine: true`)
 * - `.` — a safe ground cell (`hasMine: false`)
 * - `R` — a rock (never a mine, excluded from every solver constraint)
 *
 * Every non-rock cell is emitted as `visibility: 'hidden'` with its true
 * `adjacentMineCount` already computed, matching the shape `placeMines`
 * hands to `solveBoard` (section 2.1/2.2 of the issue-5 contract): the
 * *candidate* ground truth is fully assigned, but nothing has been opened
 * yet — `solveBoard` is responsible for simulating the initial cascade
 * itself from `firstReveal`.
 */
export function buildSolverInput(
  layout: readonly string[],
  firstReveal: Coordinate,
): SolverInput {
  const rows = layout.length;
  const columns = layout[0]?.length ?? 0;
  const grid = layout.map((row) => {
    if (row.length !== columns) {
      throw new Error(
        'buildSolverInput: every layout row must be the same length',
      );
    }
    return row.split('');
  });

  const hasMineAt = (row: number, column: number): boolean =>
    row >= 0 &&
    row < rows &&
    column >= 0 &&
    column < columns &&
    grid[row][column] === 'M';

  const cells: Cell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const symbol = grid[row][column];
      if (symbol === 'R') {
        cells.push({ terrain: 'rock' });
        continue;
      }
      if (symbol !== '.' && symbol !== 'M') {
        throw new Error(`buildSolverInput: unrecognised symbol "${symbol}"`);
      }
      let adjacentMineCount = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          if (hasMineAt(row + dr, column + dc)) adjacentMineCount += 1;
        }
      }
      cells.push({
        terrain: 'ground',
        visibility: 'hidden',
        hasMine: symbol === 'M',
        isFlagged: false,
        adjacentMineCount: adjacentMineCount as AdjacentMineCount,
      });
    }
  }

  const firstCellIndex = firstReveal.row * columns + firstReveal.column;
  const firstCell = cells[firstCellIndex];
  if (!firstCell || firstCell.terrain !== 'ground' || firstCell.hasMine) {
    throw new Error(
      'buildSolverInput: firstReveal must reference a mine-free ground cell',
    );
  }

  return { size: { rows, columns }, cells, firstReveal };
}
