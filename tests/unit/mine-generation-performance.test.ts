import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAME_CONFIG,
  createGame,
  transitionGame,
} from '../../src/contracts/game';

/**
 * Contract under test: `.claude/_workspace/03_contracts/issue-5-no-guess-mine-placement.contract.md`
 * section 7 (performance SLA).
 *
 * Measures the wall-clock duration of the single `transitionGame` call for
 * the *first* `reveal-cell` action — the call that internally drives
 * `placeMines`'s generate-and-check loop against `solveBoard` — against the
 * contractually binding budgets, with `maxGenerationAttempts` left at 200
 * (the full budget) so the loop is free to spend its worst-case effort.
 */
function revealFirstCell(
  rows: number,
  columns: number,
  seed: number,
  config: ReturnType<typeof buildConfig>,
) {
  const setup = createGame({
    type: 'new-game',
    size: { rows, columns },
    seed,
    nowMs: 0,
    config,
  });
  expect(setup.ok).toBe(true);
  if (!setup.ok) throw new Error('Expected board setup to be accepted');

  const firstIndex = setup.state.cells.findIndex(
    (cell) => cell.terrain === 'ground',
  );
  const coordinate = {
    row: Math.floor(firstIndex / columns),
    column: firstIndex % columns,
  };

  const startedAt = performance.now();
  const result = transitionGame(setup.state, {
    type: 'reveal-cell',
    coordinate,
    nowMs: 0,
  });
  const elapsedMs = performance.now() - startedAt;

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected reveal-cell to be accepted');

  return { elapsedMs, state: result.state };
}

function buildConfig(overrides: Partial<typeof DEFAULT_GAME_CONFIG>) {
  return { ...DEFAULT_GAME_CONFIG, ...overrides };
}

describe('mine placement performance SLA', () => {
  it('contract SLA row (worst case): 40x40 board at max mine density with zero rocks resolves the first reveal within 3000ms — note: at these exact parameters `solveBoard` commonly succeeds well before the 200-attempt budget is exhausted (e.g. seed 1 accepts on attempt 3), so this test measures the contractual timing budget but is not itself proof that the exhausted-budget path was exercised; see the dedicated "genuinely exhausts" test below for that', () => {
    const config = buildConfig({
      mineRatio: { min: 0.17, max: 0.17 },
      rockRatio: 0,
      maxGenerationAttempts: 200,
    });

    const { elapsedMs } = revealFirstCell(40, 40, 1, config);

    expect(elapsedMs).toBeLessThanOrEqual(3000);
  }, 10_000);

  it('genuinely exhausts the attempt budget (elevated mine density forces every candidate to be unsolvable) and still falls back within the 3000ms budget', () => {
    // Contract section 4/7: the fallback tie-break path (attemptsUsed ===
    // maxGenerationAttempts, guaranteedNoGuess === false) must itself stay
    // inside the performance budget. The contract's literal SLA row
    // (mineRatio 0.17) does not reliably exhaust the budget on ordinary
    // seeds (see the test above), so this test deliberately raises
    // mineRatio to 0.30 — a denser board that is empirically unsolvable
    // by the Rule A/B/C solver for every one of 200 candidates on every
    // seed sampled during test authoring — to force and *verify* the
    // exhausted-budget scenario the contract's worst-case row is meant to
    // stress, rather than merely asserting a timing bound that a
    // fast-exiting run would also satisfy.
    const maxGenerationAttempts = 200;
    const config = buildConfig({
      mineRatio: { min: 0.3, max: 0.3 },
      rockRatio: 0,
      maxGenerationAttempts,
    });

    const { elapsedMs, state } = revealFirstCell(40, 40, 1, config);

    expect(state.placement).not.toBeNull();
    expect(state.placement?.attemptsUsed).toBe(maxGenerationAttempts);
    expect(state.placement?.guaranteedNoGuess).toBe(false);
    expect(elapsedMs).toBeLessThanOrEqual(3000);
  }, 10_000);

  it('typical case: default 10x10 board resolves the first reveal within 500ms', () => {
    const config = buildConfig({ maxGenerationAttempts: 200 });

    const { elapsedMs } = revealFirstCell(10, 10, 1, config);

    expect(elapsedMs).toBeLessThanOrEqual(500);
  }, 10_000);
});
