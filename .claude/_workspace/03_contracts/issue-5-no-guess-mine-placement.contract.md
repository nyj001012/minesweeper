# Contract — Issue #5: No-Guess Mine Placement Algorithm

- Issue: #5 https://github.com/nyj001012/minesweeper/issues/5
- Branch: `feature/5-no-guess-mine-placement-algorithm`
- Design fingerprint: `32fd67e40f93`
- Status: **CONTRACT FINAL** — frontend-qa and frontend-developer may start in parallel against this document.
- Scope: interface/type declarations only. No production logic is implemented here. Diffs below are the exact text
  frontend-developer must apply to `src/contracts/game.ts`, `src/features/game/config/defaults.ts`, and
  `src/features/game/engine/validation.ts`; the new `src/features/game/engine/solver.ts` module body is
  frontend-developer's implementation responsibility, constrained by the signature and algorithm spec below.
- Validation performed: the full set of new/changed type declarations below was extracted into a self-contained
  harness and checked with `npx tsc --noEmit --strict` (0 errors). This is the closest static-typecheck-only
  proxy available to a tech-lead who does not modify production files; `npm run typecheck` must still be re-run
  by frontend-developer once the diffs are actually applied to `src/contracts/game.ts`.

---

## 1. Problem framing

`placeMines` (`src/features/game/engine/game.ts`) currently protects only the first-click neighborhood and then
places the remaining mines uniformly at random. This produces boards that frequently contain positions that are
only resolvable by guessing (classic "50/50" patterns). This issue introduces a **generate-and-check** loop:

1. Generate a candidate mine layout (existing logic: sampled ratio, first-click protection, random draw).
2. Simulate the cascade a player would see after the first click, then run a **pure logical solver** over that
   observed state.
3. If the solver proves the whole board is derivable by logic alone (no guessing), accept the candidate.
4. Otherwise, redraw a new candidate (new PRNG draws, same protected first click) and repeat, up to
   `config.maxGenerationAttempts` times.
5. If no attempt is fully solvable within the budget, fall back to the best candidate seen (fewest unresolved
   cells) and record that the no-guess guarantee was **not** met.

This document fixes the exact types and behavioral contract needed so frontend-qa (TDD tests) and
frontend-developer (implementation) can work independently from the same source of truth.

---

## 2. New engine module: `src/features/game/engine/solver.ts`

### 2.1 Public signature (declarations only)

```ts
export interface SolverInput {
  readonly size: BoardSize;
  /**
   * Row-major cells (index = row * columns + column), identical shape to
   * `GameState.cells`, with the full ground-truth mine layout of the
   * *candidate* already assigned (i.e. this is `Cell[]` as produced right
   * before `placeMines` would normally return — all non-rock cells still
   * carry `visibility: 'hidden'`; `hasMine`/`adjacentMineCount` are the
   * ground truth for this candidate).
   */
  readonly cells: readonly Cell[];
  /** The coordinate the player clicked first. Guaranteed `hasMine === false` by the caller's protection policy. */
  readonly firstReveal: Coordinate;
}

export interface SolverResult {
  /**
   * True iff every ground cell's mine/safe status can be derived by pure
   * logical deduction (see section 2.3) starting from the cells revealed by
   * simulating the first-click cascade, with zero guessing required.
   */
  readonly solvable: boolean;
  /**
   * Count of ground cells whose mine/safe status remains logically
   * undetermined after the deduction loop reaches a fixed point.
   * MUST be exactly 0 when `solvable` is `true`.
   * MUST be > 0 when `solvable` is `false`.
   */
  readonly unresolvedCellCount: number;
}

/**
 * Pure function: does not mutate `input.cells` (or any nested cell object),
 * does not read the system clock, does not consume/advance any PRNG, and
 * returns identical output for identical input on every call (referential
 * transparency). Two independent calls with structurally equal inputs MUST
 * produce structurally equal outputs.
 */
export declare function solveBoard(input: SolverInput): SolverResult;
```

`solveBoard` will be re-exported from `src/contracts/game.ts` once `solver.ts` exists (see section 4.3). It lives
in `engine/` (not `state/` or `components/`) because it is pure domain logic with no React dependency, consistent
with the existing `engine/board.ts` / `engine/random.ts` / `engine/validation.ts` convention.

### 2.2 Why `Cell[]` + `Coordinate` and not a stripped "observed" type

The issue asks for an input "similar to the current `Cell[]`/`GameState`". Reusing `Cell` (full ground truth)
rather than inventing a UI-safe "observed" type keeps the signature simple and symmetric with how `placeMines`
already builds a full `Cell[]` candidate. The trade-off is that **type-level purity is not enforced** — nothing
stops an implementation from peeking at `hasMine` of a still-hidden cell during the deduction phase. This is
deliberately compensated for with a hard behavioral rule instead of a type-level one (see 2.3, "Purity rule"),
because:

- A stripped "observed-only" type would require either duplicating `Cell`'s ground/rock discrimination in a new
  type, or a conversion step that itself needs testing — extra surface for a contract addition whose sole purpose
  is an internal, non-exported implementation detail.
- The correctness property that actually matters ("no guess is required") only depends on the *deduction step*
  not consulting hidden ground truth; the *cascade simulation step* legitimately needs ground truth (it has to
  know which cells are zero-mine to flood-fill them, exactly like `transitionGame` already does).
- frontend-qa can and must verify this behaviorally (section 6) with fixtures where a "cheating" solver would
  produce a different, detectably wrong answer than a correct pure-logic solver.

### 2.3 Algorithm specification

**Step 1 — Simulate the initial reveal.** Using the *same* flood-fill algorithm already implemented in
`transitionGame` (queue + `visited` set, cascading through zero-`adjacentMineCount` cells, stopping at rocks and
mines), compute the set `revealed` of cell indices that would be visible immediately after the player clicks
`firstReveal`. `firstReveal` itself is included (its `hasMine` must be `false`; this is guaranteed by the caller's
existing protection policy and is a precondition, not something `solveBoard` re-validates).

**Step 2 — Deduction loop.** Maintain two disjoint, initially empty sets over ground-cell indices:
`determinedMine` (logically proven mines, never opened) and the `revealed` set from Step 1 (cells proven safe
*and* opened, including newly deduced ones — see below). Repeat the following pass until a full pass makes no
change:

For every index `i` in `revealed` where `cells[i].terrain === 'ground'`:
- Let `neighbors = adjacent(size, i)` (existing 8-directional helper), restricted to ground cells only (rocks are
  never mines and are excluded from every set below).
- Let `hidden(i) = { n in neighbors : n not in revealed and n not in determinedMine }` — the still-undetermined
  neighbors of `i`.
- Let `required(i) = cells[i].adjacentMineCount - |{ n in neighbors : n in determinedMine }|` — mines still owed
  by this constraint after already-known mines are subtracted.
- If `hidden(i)` is empty, this constraint is exhausted; skip it.
- **Rule A (full-count):** if `required(i) === |hidden(i)|`, every cell in `hidden(i)` is a mine → add to
  `determinedMine`.
- **Rule B (zero-count):** if `required(i) === 0`, every cell in `hidden(i)` is safe → **open** it (add to
  `revealed`; if its true `adjacentMineCount` is `0`, flood-fill from it using the same cascade algorithm as Step
  1, which may pull in further cells and thus further constraints).
- **Rule C (subset/pattern elimination):** for every other constraint `j` (built from the same pass, using
  `hidden(j)`/`required(j)` computed the same way) such that `hidden(i) ⊆ hidden(j)` and `hidden(i) != hidden(j)`:
  - `diff = hidden(j) \ hidden(i)`, `diffRequired = required(j) - required(i)`.
  - If `diffRequired === 0`, every cell in `diff` is safe → open it (same as Rule B).
  - If `diffRequired === |diff|`, every cell in `diff` is a mine → add to `determinedMine` (same as Rule A).

Newly opened/mined cells feed back into the next pass (their neighbors' constraints are recomputed), so the loop
converges to a fixed point where no further deduction is possible.

**Step 3 — Verdict.** Let `totalGroundCells = |{ i : cells[i].terrain === 'ground' }|`. If
`|revealed| + |determinedMine| === totalGroundCells`, return `{ solvable: true, unresolvedCellCount: 0 }`.
Otherwise return `{ solvable: false, unresolvedCellCount: totalGroundCells - |revealed| - |determinedMine| }`.

**Purity rule (binding, not just advisory):** the deduction loop (Steps 2–3) MUST NOT read `hasMine` of any cell
that is not already in `revealed` at the time of the read. Ground truth may only be consulted (a) during flood-
fill cascades triggered by Step 1 or by a Rule B/C "open" action (to decide whether a newly-opened zero-cell
cascades further), and (b) to read `adjacentMineCount` of cells already in `revealed`. This is what makes
`solvable: true` a genuine "no guessing required" guarantee rather than an artifact of peeking at the answer.

### 2.4 Decision: include subset/pattern inference (Rule C) — rationale

**Decision: include it.** Basic rules (A/B) alone resolve only a small fraction of naturally generated boards —
extremely common patterns (e.g. chains of overlapping constraints, the canonical "1-2-1" wall pattern) are
unsolvable by A/B alone even though they carry no genuine ambiguity. Without Rule C, the generate-and-check loop
would almost always exhaust `maxGenerationAttempts` and fall back to the non-guaranteed placement, which defeats
the purpose of this issue for anything but trivially sparse boards.

Rule C keeps the algorithm **sound** (every deduction it makes is a logically forced conclusion — it never
declares a cell mine/safe unless every valid mine assignment consistent with the revealed numbers agrees), which
is the property that matters for `guaranteedNoGuess: true` to be trustworthy. It is not **complete** — there exist
boards that are logically solvable only via full constraint-satisfaction enumeration (treating all overlapping
constraints as a CSP and checking whether every remaining assignment agrees on each cell) that Rule C alone will
report as unsolvable. This is an accepted trade-off:

- A false "unsolvable" verdict only costs one extra regeneration attempt (bounded by `maxGenerationAttempts`) —
  cheap and never produces an incorrect `guaranteedNoGuess: true`.
- Full CSP enumeration is combinatorial in the number of independent constraint groups and, in the worst case,
  exponential in the size of a connected constraint region. On a board up to 40×40 with mine ratio up to 0.17
  (~272 mines, large frontiers), this risks blowing far past the performance budget in section 7, especially
  since it would need to run up to `maxGenerationAttempts` times per game start.
- Rules A–C are all boundable by simple set operations over at most 8-neighbor windows and terminate in a number
  of passes bounded by the number of cells resolved (each pass resolves at least one cell or the loop stops), so
  their cost stays polynomial and predictable, which is what a repeated-retry generator needs.

**Implementation guidance (non-binding on the type signature, binding on the performance SLA in section 7):**
frontend-developer should implement the deduction loop as a worklist (re-examine only constraints touching a
cell that just changed) rather than recomputing every constraint from scratch every pass, to stay within the
section 7 time budget on large boards. The `solveBoard` signature does not encode this — it is an internal
efficiency concern the performance test in section 7 will catch if violated.

---

## 3. `GameConfig` change

Add a required field. Position: after `adjacentProtectionWeights` (end of the interface).

```diff
 export interface GameConfig {
   readonly minRows: number;
   readonly maxRows: number;
   readonly minColumns: number;
   readonly maxColumns: number;
   readonly mineRatio: RatioRange;
   readonly rockRatio: number;
   readonly maxRockClusterSize: number;
   readonly adjacentProtectionWeights: AdjacentProtectionWeights;
+  /**
+   * Upper bound on the number of candidate mine layouts `placeMines` will
+   * generate-and-check with `solveBoard` before falling back to the
+   * best-effort (fewest unresolved cells) candidate. Must be a positive
+   * integer (see `INVALID_MAX_GENERATION_ATTEMPTS` in validation.ts).
+   */
+  readonly maxGenerationAttempts: number;
 }
```

### 3.1 Default value: `200` — rationale

Kept at the issue-proposed value of **200**. Reasoning:

- **Too low (e.g. tens):** the solver (Rules A–C) is sound but incomplete, so some fraction of random candidates
  will report `solvable: false` even though a differently-sampled layout for the same board/first-click would
  succeed. A low attempt budget makes `guaranteedNoGuess: false` fallbacks common on ordinary boards, which
  defeats the feature's purpose for typical play, not just edge cases.
- **Too high (e.g. thousands+):** worst-case wall-clock time is `attempts × per-attempt cost`. On the largest
  configurable board (40×40, see section 7), this multiplies linearly and risks user-visible latency on the very
  first click of a new game.
- **200** gives comfortable headroom above the attempt counts empirically expected to be needed for the
  sound-but-incomplete Rule A–C solver on typical boards (single-digit to low tens of attempts is the common
  case for a solver with subset elimination), while keeping the guaranteed worst case (all 200 attempts
  exhausted on the largest board) inside the section 7 budget.
- No evidence in this issue or the existing codebase suggests a different number is better; 200 is retained as
  the shipped default rather than invented from scratch.

`src/features/game/config/defaults.ts` diff:

```diff
 export const DEFAULT_GAME_CONFIG: Readonly<GameConfig> = Object.freeze({
   minRows: 5,
   maxRows: 40,
   minColumns: 5,
   maxColumns: 40,
   mineRatio: Object.freeze({ min: 0.13, max: 0.17 }),
   rockRatio: 0.08,
   maxRockClusterSize: 4,
   adjacentProtectionWeights: Object.freeze([
     5, 10, 15, 20, 20, 15, 10, 5,
   ] as const),
+  maxGenerationAttempts: 200,
 });
```

---

## 4. `MinePlacementRecord` change

```diff
 export interface MinePlacementRecord {
   readonly sampledMineRatio: number;
   readonly mineCount: number;
   readonly firstReveal: Coordinate;
   readonly requestedAdjacentProtectionCount: number;
   readonly protectedCoordinates: readonly Coordinate[];
+  /**
+   * True when a candidate that `solveBoard` proved fully solvable was found
+   * within `config.maxGenerationAttempts` tries. False when the budget was
+   * exhausted and the best-effort fallback (candidate with the fewest
+   * `unresolvedCellCount`, first-seen wins ties) was retained instead.
+   */
+  readonly guaranteedNoGuess: boolean;
+  /**
+   * Number of candidate generations attempted (1..=config.maxGenerationAttempts)
+   * before the final placement was accepted. Exists for observability and for
+   * the frontend-qa performance/behavior tests in section 6-7; not otherwise
+   * consumed by UI. Addition beyond the issue's minimum ask — flagged here as
+   * a deliberate, additive, backward-compatible extension.
+   */
+  readonly attemptsUsed: number;
 }
```

**Fallback tie-break policy (binding on `placeMines`, not on `solveBoard`):** when no candidate is fully solvable
within `maxGenerationAttempts`, `placeMines` MUST retain the candidate with the **lowest** `unresolvedCellCount`
seen across all attempts (first attempt wins ties), set `guaranteedNoGuess: false`, and set
`attemptsUsed: config.maxGenerationAttempts`. When a fully solvable candidate is found on attempt `k`,
`attemptsUsed: k` and `guaranteedNoGuess: true`.

### 4.1 `SolverInput` / `SolverResult` placement in `src/contracts/game.ts`

Insert immediately after `MinePlacementRecord` (before `GameState`):

```diff
 export interface MinePlacementRecord {
   ...
+  readonly guaranteedNoGuess: boolean;
+  readonly attemptsUsed: number;
 }
 
+export interface SolverInput {
+  readonly size: BoardSize;
+  readonly cells: readonly Cell[];
+  readonly firstReveal: Coordinate;
+}
+
+export interface SolverResult {
+  readonly solvable: boolean;
+  readonly unresolvedCellCount: number;
+}
+
 /** Aggregate root. Cells use row-major indexing: row * columns + column. */
 export interface GameState {
```

### 4.2 `SetupErrorCode` union extension

```diff
 export type SetupErrorCode =
   | 'ROWS_NOT_INTEGER'
   | 'ROWS_OUT_OF_RANGE'
   | 'COLUMNS_NOT_INTEGER'
   | 'COLUMNS_OUT_OF_RANGE'
   | 'INVALID_MINE_RATIO'
   | 'INVALID_ROCK_RATIO'
   | 'INVALID_ROCK_CLUSTER_SIZE'
   | 'INVALID_PROTECTION_WEIGHTS'
+  | 'INVALID_MAX_GENERATION_ATTEMPTS'
   | 'INSUFFICIENT_MINE_CANDIDATES'
   | 'INVALID_SEED'
   | 'INVALID_TIMESTAMP';
```

No change needed to `SetupValidationError['field']` — the existing `'config'` value already covers this case,
consistent with how `INVALID_ROCK_RATIO` / `INVALID_ROCK_CLUSTER_SIZE` / `INVALID_PROTECTION_WEIGHTS` are
reported today.

### 4.3 Runtime re-export (add once `solver.ts` exists)

```diff
 /** Runtime implementations of the public contract. */
 export { createGame, transitionGame } from '../features/game/engine/game';
 export { parseBoardSize } from '../features/game/engine/validation';
+export { solveBoard } from '../features/game/engine/solver';
 export {
   selectGameViewModel,
   getElapsedSeconds,
 } from '../features/game/state/selectors';
```

This line must only be added by frontend-developer once `src/features/game/engine/solver.ts` exists and exports
`solveBoard` matching section 2.1 exactly — adding it earlier would break `npm run typecheck` (module not found).

---

## 5. `validation.ts` change

Add a new check in `validateSetup` (existing convention: use the local `add(code)` helper, `field` defaults to
`'config'`, generic Korean message via `add`'s existing implementation). Naming follows the existing
`INVALID_<THING>` convention used by `INVALID_ROCK_RATIO` / `INVALID_ROCK_CLUSTER_SIZE` /
`INVALID_PROTECTION_WEIGHTS`.

```diff
   if (
     config.adjacentProtectionWeights.length !== 8 ||
     config.adjacentProtectionWeights.some(
       (w) => !Number.isInteger(w) || w <= 0,
     ) ||
     config.adjacentProtectionWeights.reduce((a, b) => a + b, 0) !== 100
   )
     add('INVALID_PROTECTION_WEIGHTS');
+  if (
+    !Number.isInteger(config.maxGenerationAttempts) ||
+    config.maxGenerationAttempts < 1
+  )
+    add('INVALID_MAX_GENERATION_ATTEMPTS');
   if (
     !Number.isInteger(action.seed) ||
```

Validation rule: `maxGenerationAttempts` is valid iff it is an integer and `>= 1`. No upper bound is imposed by
this contract (the issue only asked for "양의 정수" — positive integer). **Open item for a future issue:** an
absurdly large value (e.g. `1e9`) is type-valid but could make worst-case generation time unbounded; not capped
here to avoid inventing an unrequested constraint, but noted for `system-architect`/`tech-lead` follow-up.

---

## 6. Test-fixture guidance for frontend-qa (non-binding suggestions, no code written here)

- **Determinism/purity:** call `solveBoard` twice with the same (deep-equal, freshly constructed) `SolverInput`
  and assert identical `SolverResult` and that the input's `cells` array reference/contents are unchanged
  afterward (e.g. compare against a deep clone taken before the call).
- **Basic-rule-only board:** a tiny hand-built board where Rule A/B alone fully resolve everything →
  `{ solvable: true, unresolvedCellCount: 0 }`.
- **Subset-rule-required board:** a hand-built "1-2-1"-style pattern that is unsolvable by Rule A/B alone but
  solvable once Rule C is applied → `{ solvable: true, unresolvedCellCount: 0 }`. This is the key regression test
  that catches an implementation that "forgot" Rule C.
- **Genuinely unsolvable (50/50) board:** a hand-built pattern with two symmetric hidden cells sharing a single
  ambiguous constraint (no information distinguishes them) → `{ solvable: false, unresolvedCellCount: 2 }` (or
  whatever the true unresolved count is for the fixture).
- **Purity/no-cheating check:** construct a board where a naive implementation that reads `hasMine` on hidden
  cells would misreport `solvable: true` on a fixture that is actually ambiguous from the revealed numbers alone
  — assert `solvable: false` to catch that class of bug.
- **Validation:** `maxGenerationAttempts` of `0`, `-1`, `1.5`, `NaN` each produce a `GameSetupRejected` containing
  `code: 'INVALID_MAX_GENERATION_ATTEMPTS'`; `1` and `200` are accepted.
- **End-to-end via `createGame` + `transitionGame`:** for a chosen small board/seed known (by construction) to
  need more than one attempt, assert `state.placement?.guaranteedNoGuess === true` and
  `state.placement.attemptsUsed <= state.config.maxGenerationAttempts` after the first `reveal-cell`.
- **Fallback path:** construct (or force via a tiny `maxGenerationAttempts` like `1` combined with a board/seed
  unlikely to solve in one try) a scenario where the budget is exhausted; assert
  `guaranteedNoGuess === false` and `attemptsUsed === config.maxGenerationAttempts`, and that the game is still
  fully playable (existing invariants around `cells`/`totalMineCount` still hold).

---

## 7. Performance SLA (binding numeric budget for frontend-qa's perf test and frontend-developer's implementation)

Measured as the wall-clock duration of the single `transitionGame` call for the **first** `reveal-cell` action
(the call that internally triggers `placeMines`'s generate-and-check loop), in the Vitest `unit` project
(`environment: 'node'`), on the CI runner (GitHub Actions `ubuntu-latest`, per the existing workflow).

| Scenario | Board | `mineRatio` | `rockRatio` | Attempts exhausted | Budget |
| --- | --- | --- | --- | --- | --- |
| Worst case | `rows: 40, columns: 40` (max per `DEFAULT_GAME_CONFIG`) | `{ min: 0.17, max: 0.17 }` (max density) | `0` (maximize ground-cell/constraint count) | all `maxGenerationAttempts` (200, forced to the fallback path) | **≤ 3000 ms** total |
| Typical case | `rows: 10, columns: 10` (default) | `{ min: 0.13, max: 0.17 }` (default) | `0.08` (default) | all `maxGenerationAttempts` (200, forced to the fallback path) | **≤ 500 ms** total |

Rationale for the numeric choices: 3 seconds on the largest configurable board sits inside the "수백 ms ~ 수 초"
range this issue itself allows, and implies an average per-attempt budget of ~15 ms for a 1600-cell worst-case
board — achievable by the Rules A–C solver (bounded 8-neighbor set operations, worklist-based propagation) but
not by full CSP enumeration, which is precisely why section 2.4 rejects the latter. The typical-case row exists
so CI does not need to run the expensive 40×40 scenario on every test invocation to get a fast regression signal
on ordinary boards.

If frontend-developer's implementation cannot meet the worst-case budget, that is a signal to revisit either the
Rule C implementation strategy (must be worklist/incremental, not full recomputation per pass) or the
`maxGenerationAttempts` default (section 3.1) — not to silently drop Rule C or the SLA.

---

## 8. Summary of files touched (for frontend-developer)

| File | Change |
| --- | --- |
| `src/contracts/game.ts` | Add `maxGenerationAttempts` to `GameConfig`; add `guaranteedNoGuess`/`attemptsUsed` to `MinePlacementRecord`; add `SolverInput`/`SolverResult`; extend `SetupErrorCode`; add `solveBoard` re-export (only once `solver.ts` exists) |
| `src/features/game/config/defaults.ts` | Add `maxGenerationAttempts: 200` to `DEFAULT_GAME_CONFIG` |
| `src/features/game/engine/validation.ts` | Add `INVALID_MAX_GENERATION_ATTEMPTS` check in `validateSetup` |
| `src/features/game/engine/solver.ts` (new) | Implement `solveBoard` per section 2 |
| `src/features/game/engine/game.ts` | `placeMines` gains the generate-and-check retry loop (section 4, fallback tie-break policy) — logic change, not a type/contract change, left to frontend-developer's implementation |

No changes to `Board.tsx`, styles, or first-click protection policy — out of scope per the issue.
