# Phase 3 infrastructure

- DESIGN_FINGERPRINT: `42e0f4c6bf58`
- Node >=22.12 and npm >=10; dependency versions resolved in package-lock.json.
- React/Vite/TypeScript, ESLint/Prettier, Vitest unit+jsdom component projects, Playwright Chromium+WebKit configured.
- Standard npm scripts supplied. `npm run format -- <owned files>` scopes formatting.
- E2E builds use Vite mode `e2e`; production builds use the normal production mode.
- CI installs from lockfile, checks injected design, runs check and both E2E browser projects. Failure reports retained 7 days.
- Pages runs only for successful main push CI, checks out the exact verified head SHA, rebuilds with repository base path, uploads dist, and grants deployment permissions only to the deploy job.
- Additional harness file required in commit: `.codex/tools/inject-design.mjs`. It imports only Node built-ins; design source and target agent definitions are already tracked.
- Installation passed: 281 packages, npm audit reported 0 vulnerabilities. Registry access required sandbox escalation.
- Infrastructure files formatted; design injection check passed.
- Validation revealed QA-owned issues: HTMLElement.disabled type access in component tests (lines 62/92/108), prefer-const at unit/game-engine.test.ts:244, and first-click timer component test timeout. No test files modified.
- Unit run: 35 passed, 1 timer test timed out. App build/check completion remains with frontend/QA after these issues are resolved.
- No server, database, secrets, telemetry backend, or actual deployment needed/performed. GitHub Pages must be enabled in repository settings before deployment.
