import type { Cell, SolverInput, SolverResult } from '../../../contracts/game';
import { adjacent } from './board';

interface Constraint {
  readonly hidden: readonly number[];
  readonly hiddenSet: ReadonlySet<number>;
  readonly required: number;
}

function isSubsetOf(
  small: ReadonlySet<number>,
  big: ReadonlySet<number>,
): boolean {
  for (const value of small) if (!big.has(value)) return false;
  return true;
}

/**
 * Pure, deterministic logical solver used by `placeMines` to reject
 * candidate mine layouts that would require guessing. See
 * `.claude/_workspace/03_contracts/issue-5-no-guess-mine-placement.contract.md`
 * section 2 for the full algorithm specification this implements.
 *
 * Purity rule: the deduction loop (everything after the initial cascade)
 * never reads `hasMine` of a cell that is not already in `revealed`. Ground
 * truth is only consulted while flood-filling a cell that has just been
 * opened (either the initial reveal or a Rule B/C deduction), which is the
 * one place the specification explicitly permits it.
 */
export function solveBoard(input: SolverInput): SolverResult {
  const { size, cells, firstReveal } = input;
  const startIndex = firstReveal.row * size.columns + firstReveal.column;

  const revealed = new Set<number>();
  const determinedMine = new Set<number>();
  const queued = new Set<number>();

  const cascade = (start: number): void => {
    if (revealed.has(start) || queued.has(start)) return;
    const queue: number[] = [start];
    queued.add(start);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      const candidate: Cell = cells[current];
      if (candidate.terrain !== 'ground') continue;
      if (candidate.hasMine) continue;
      if (revealed.has(current)) continue;
      revealed.add(current);
      if (candidate.adjacentMineCount === 0) {
        for (const next of adjacent(size, current)) {
          if (!queued.has(next)) {
            queued.add(next);
            queue.push(next);
          }
        }
      }
    }
  };

  cascade(startIndex);

  const totalGroundCells = cells.filter((c) => c.terrain === 'ground').length;

  for (;;) {
    const revealedSnapshot = [...revealed];
    const constraints: Constraint[] = [];
    for (const i of revealedSnapshot) {
      const cell = cells[i];
      if (cell.terrain !== 'ground') continue;
      const neighbors = adjacent(size, i).filter(
        (n) => cells[n].terrain === 'ground',
      );
      const hidden = neighbors.filter(
        (n) => !revealed.has(n) && !determinedMine.has(n),
      );
      if (hidden.length === 0) continue;
      const minesKnown = neighbors.filter((n) => determinedMine.has(n)).length;
      const required = cell.adjacentMineCount - minesKnown;
      constraints.push({ hidden, hiddenSet: new Set(hidden), required });
    }

    const newMines = new Set<number>();
    const newSafe = new Set<number>();

    // Index constraints by each hidden cell they reference, so Rule C only
    // compares constraints that could possibly be in a subset relationship
    // (a necessary condition for hidden(i) subset of hidden(j) is that they
    // share at least one hidden cell).
    const byHiddenCell = new Map<number, number[]>();
    constraints.forEach((constraint, idx) => {
      for (const h of constraint.hidden) {
        const owners = byHiddenCell.get(h);
        if (owners) owners.push(idx);
        else byHiddenCell.set(h, [idx]);
      }
    });

    for (const constraint of constraints) {
      if (constraint.required === constraint.hidden.length) {
        for (const h of constraint.hidden) newMines.add(h);
      } else if (constraint.required === 0) {
        for (const h of constraint.hidden) newSafe.add(h);
      }
    }

    for (let ci = 0; ci < constraints.length; ci++) {
      const a = constraints[ci];
      const candidates = new Set<number>();
      for (const h of a.hidden) {
        for (const cj of byHiddenCell.get(h) ?? []) {
          if (cj !== ci) candidates.add(cj);
        }
      }
      for (const cj of candidates) {
        const b = constraints[cj];
        if (a.hidden.length >= b.hidden.length) continue;
        if (!isSubsetOf(a.hiddenSet, b.hiddenSet)) continue;
        const diff = b.hidden.filter((n) => !a.hiddenSet.has(n));
        const diffRequired = b.required - a.required;
        if (diffRequired === 0) {
          for (const n of diff) newSafe.add(n);
        } else if (diffRequired === diff.length) {
          for (const n of diff) newMines.add(n);
        }
      }
    }

    let changed = false;
    for (const mine of newMines) {
      if (!determinedMine.has(mine)) {
        determinedMine.add(mine);
        changed = true;
      }
    }
    for (const safe of newSafe) {
      if (!revealed.has(safe) && !determinedMine.has(safe)) {
        cascade(safe);
        changed = true;
      }
    }

    if (!changed) break;
  }

  const unresolvedCellCount =
    totalGroundCells - revealed.size - determinedMine.size;
  return unresolvedCellCount === 0
    ? { solvable: true, unresolvedCellCount: 0 }
    : { solvable: false, unresolvedCellCount };
}
