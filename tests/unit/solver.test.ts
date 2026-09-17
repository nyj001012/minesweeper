import { describe, expect, it } from 'vitest';

import { solveBoard, type SolverInput } from '../../src/contracts/game';
import { buildSolverInput } from '../fixtures/solver';

/**
 * Contract under test: `.claude/_workspace/03_contracts/issue-5-no-guess-mine-placement.contract.md`
 * section 2 (`src/features/game/engine/solver.ts`, `solveBoard`).
 */
describe('solveBoard', () => {
  it('solves a board with pure full-count/zero-count deduction (Rule A/B only)', () => {
    // 3x3, single mine at (2,2). The initial cascade from (0,0) opens every
    // cell except the mine; the sole remaining hidden cell is then pinned by
    // Rule A (the last constraint's required count equals its hidden count).
    const input = buildSolverInput(['...', '...', '..M'], {
      row: 0,
      column: 0,
    });

    expect(solveBoard(input)).toEqual({
      solvable: true,
      unresolvedCellCount: 0,
    });
  });

  it('solves a classic 1-2-1 wall pattern that requires subset elimination (Rule C)', () => {
    // 4x3, mines at (3,0) and (3,2). After the initial cascade, row 3 is
    // entirely hidden with revealed counts 1-2-1 across row 2. Rule A/B
    // alone cannot resolve any of the three hidden cells on the first pass
    // (no constraint's hidden-set size equals its required count), so this
    // fixture is a regression guard for an implementation that "forgot"
    // Rule C (contract section 2.4).
    const input = buildSolverInput(['...', '...', '...', 'M.M'], {
      row: 0,
      column: 0,
    });

    expect(solveBoard(input)).toEqual({
      solvable: true,
      unresolvedCellCount: 0,
    });
  });

  it('reports a genuine 50/50 as unsolvable with the exact undetermined count', () => {
    // 2x3, single mine at (1,2). The initial cascade from (0,0) reveals
    // every cell except (0,2) and (1,2). Both remaining revealed
    // constraints — (0,1) and (1,1), each counting 1 — cover the identical
    // hidden pair {(0,2), (1,2)}, so no rule (A, B, or C) can distinguish
    // which of the two carries the mine: a genuine, unresolvable guess.
    const input = buildSolverInput(['...', '..M'], { row: 0, column: 0 });

    expect(solveBoard(input)).toEqual({
      solvable: false,
      unresolvedCellCount: 2,
    });
  });

  it('does not peek at hidden ground truth: two boards with an identical observable pattern but a different hidden mine must produce the same verdict', () => {
    // Same shape as the 50/50 fixture above, but the true mine is swapped to
    // the other symmetric candidate. The revealed cells and their counts
    // are byte-for-byte identical between the two inputs; only the ground
    // truth of the two still-hidden cells differs. A solver that only
    // reasons from revealed information (the purity rule in contract
    // section 2.3) MUST return the identical result for both. An
    // implementation that "cheats" by reading `hasMine` on hidden cells
    // would instead report a different (and wrongly confident) verdict
    // depending on which literal input it was given.
    const mineOnRight = buildSolverInput(['...', '..M'], {
      row: 0,
      column: 0,
    });
    const mineOnTopRight = buildSolverInput(['..M', '...'], {
      row: 0,
      column: 0,
    });

    const resultA = solveBoard(mineOnRight);
    const resultB = solveBoard(mineOnTopRight);

    expect(resultA).toEqual(resultB);
    expect(resultA).toEqual({ solvable: false, unresolvedCellCount: 2 });
  });

  it('excludes rocks from every constraint (rocks are never mines and never counted as hidden)', () => {
    // Same 1-2-1 layout as above, but with an isolated rock dropped in a
    // corner that is never reachable by the first-click cascade. The rock
    // must not be counted as an unresolved ground cell, and must not be
    // treated as a hidden candidate by any constraint that happens to
    // border it.
    const input = buildSolverInput(['..R', '...', '...', 'M.M'], {
      row: 0,
      column: 0,
    });

    expect(solveBoard(input)).toEqual({
      solvable: true,
      unresolvedCellCount: 0,
    });
  });

  it('is a pure function: identical (deep-equal) inputs yield identical outputs and the input is left unmodified', () => {
    const input: SolverInput = buildSolverInput(['...', '...', '...', 'M.M'], {
      row: 0,
      column: 0,
    });
    const beforeCall = structuredClone(input);

    const first = solveBoard(input);
    const second = solveBoard(structuredClone(input));

    expect(first).toEqual(second);
    expect(input).toEqual(beforeCall);
  });
});
