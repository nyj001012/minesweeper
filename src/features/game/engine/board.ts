import type { BoardSize, Coordinate, Cell } from '../../../contracts/game';
import { randomSource, shuffle } from './random';

export const coordinateOf = (size: BoardSize, index: number): Coordinate => ({
  row: Math.floor(index / size.columns),
  column: index % size.columns,
});
export function adjacent(
  size: BoardSize,
  index: number,
  orthogonal = false,
): number[] {
  const { row, column } = coordinateOf(size, index);
  const result: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (
        (dr === 0 && dc === 0) ||
        (orthogonal && Math.abs(dr) + Math.abs(dc) !== 1)
      )
        continue;
      const r = row + dr,
        c = column + dc;
      if (r >= 0 && c >= 0 && r < size.rows && c < size.columns)
        result.push(r * size.columns + c);
    }
  return result;
}

export function createTerrain(
  size: BoardSize,
  count: number,
  maxCluster: number,
  random: ReturnType<typeof randomSource>,
): Cell[] | null {
  const cells: Cell[] = Array.from(
    { length: size.rows * size.columns },
    () => ({
      terrain: 'ground',
      visibility: 'hidden',
      hasMine: false,
      isFlagged: false,
      adjacentMineCount: 0,
    }),
  );
  // Separate growth units cannot touch: connected components retain the size bound.
  const blocked = new Set<number>();
  const starts = shuffle(
    Array.from({ length: cells.length }, (_, i) => i),
    random,
  );
  let remaining = count;
  for (const start of starts) {
    if (!remaining) break;
    if (blocked.has(start)) continue;
    const target = Math.min(
      remaining,
      1 + Math.floor(random.next() * maxCluster),
    );
    const cluster = new Set([start]);
    const frontier = shuffle(adjacent(size, start, true), random);
    for (
      let cursor = 0;
      cursor < frontier.length && cluster.size < target;
      cursor++
    ) {
      const next = frontier[cursor];
      if (blocked.has(next) || cluster.has(next)) continue;
      cluster.add(next);
      frontier.push(...shuffle(adjacent(size, next, true), random));
    }
    for (const i of cluster) {
      cells[i] = { terrain: 'rock' };
      blocked.add(i);
      adjacent(size, i, true).forEach((n) => blocked.add(n));
    }
    remaining -= cluster.size;
  }
  return remaining ? null : cells;
}
