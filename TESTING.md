# Testing

Agent-facing guide for how we test Pet Assistant: what to cover, where tests live, and how to run them.

## North star

Test **behavior at meaningful boundaries**. Prefer confidence over line coverage — **no coverage targets, no tautological “code we wrote” tests**. Write a test only when it catches a regression a user (or API consumer) would feel, or locks a non-obvious contract. Prefer fewer sharp tests over many shallow ones.

Tests must be fast and run on potato hardware (Raspberry Pi class hosts) with no external cloud dependencies in CI.

## Test pyramid

| Layer               | What                                                                      | Where                                          |
| ------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| **Unit**            | Pure functions, shared form contracts, deterministic edge cases           | Colocated `test/` (`*.test.ts` / `*.test.tsx`) |
| **Contract**        | Cross-package serialization, algorithm parity (gaps TypeBox cannot catch) | `packages/api/test/contracts/`                 |
| **API integration** | Full route stack via `inject()` + temp SQLite                             | `packages/api/test/integration/`               |
| **Browser E2E**     | Deferred (optional tiny Playwright smokes later — not for business rules) | —                                              |

## What TypeBox already covers

Shared schemas in `packages/shared/src/schemas/api/` are the JSON contract between API and UI. Fastify validates every response against registered TypeBox schemas at runtime.

**Do not** maintain schema golden fixture files or assert `Value.Check(schema, body)` in tests — that duplicates Fastify validation and couples tests to shape instead of behavior.

## Boundaries map

### `packages/shared`

- **Unit:** binary codecs (`binary/litterbox/`), schema helpers (`feederFoodCompartments.ts`)
- **Not:** route handlers, React components

### `packages/api`

- **Unit:** `StateAnalyzer`, `analyticsCoverage`, `enrichFoodIntake`, SurePet timeline mapping — existing suites under `src/services/**/test/`
- **Integration:** HTTP `inject()` → route → Kysely → SQLite → serialize → response
- **Not:** line-by-line route handler tests; real SurePet/ESPHome cloud calls

### `packages/ui`

- **Unit (lib):** day ranges, regional/format helpers, untracked intervals, litterbox decode/bout helpers
- **Unit (shared UX):** form hooks (`useDraftForm`, `useAppForm`, `useUnsavedBlocker`) and kit/chrome contracts (`FormActions` submitting, `FormShell` submit+error, `ConfirmDialog` confirming) via jsdom + Testing Library
- **Not:** page/route React trees, snapshots, thin prop-plumbing wrappers, Playwright for business rules

Business / persistence rules stay on **API unit + `inject()` integration** — do not retest them in UI pages or E2E.

## UI React unit harness

`packages/ui` runs `tsx --tsconfig ./tsconfig.app.json --import ./src/test/register.ts --test` on `**/test/*.test.ts` and `**/test/*.test.tsx`.

- [`src/test/register.ts`](packages/ui/src/test/register.ts) — jsdom globals, jsdom `Event` constructors (override Node’s), CSS import stub
- [`src/test/render.tsx`](packages/ui/src/test/render.tsx) — `renderWithProviders` (minimal i18n; optional `MemoryRouter`)
- Stay on `node:test` + `assert` — no Vitest/Jest

Focused UI run:

```bash
# from packages/ui
npm run test:unit
tsx --tsconfig ./tsconfig.app.json --import ./src/test/register.ts --test src/hooks/form/test/
```

## API integration harness

Phase 0 DI enables injecting a temp database. Use helpers in `packages/api/test/helpers/`:

```ts
import { after, before } from 'node:test';
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';
import { insertPet } from '../helpers/fixtures.ts';

let ctx: TestDbContext;

before(async () => {
  ctx = await createTestDb();
});

after(async () => {
  await destroyTestDb(ctx);
});

// Given empty DB
// When POST /api/pets { name: "Mochi" }
// Then 201, body.name === "Mochi", GET / lists one pet
```

**Lifecycle per test file:**

1. `createTestDb()` — `mkdtemp`, `createDb(tmpPath)`, `migrateToLatest(db)`
2. `createTestApp(ctx)` — `buildApp({ db, logger: false })`
3. `app.inject({ method, url, payload })` — assert status + behavioral fields
4. `destroyTestDb(ctx)` — `db.destroy()`, remove temp dir

**Seed factories** (`fixtures.ts`): `insertPet()`, `insertLitterboxEvent()`, etc. First argument is always the `db` instance. Factory inputs are **derived** from Kysely `New*` row types and shared event data shapes (`Partial<Pick<NewPet, …>>`, `Pick<LitterboxUseEventData, …>`) — do not add parallel `Insert*Options` interfaces.

**Integration manager in tests:** use `createTestIntegrationManager(db)` (same provider registry as production). Routes depend on `DeviceIntegrationContext` — the narrow port implemented by `IntegrationManager`. Stub account-level behavior via `registerAccountManager` on the real manager.

**What is in the slice:** Fastify routes, real migrations, real SQLite, TypeBox response validation.

**What is out:** browser, Vite, production DB, real provider clouds. Mock `fetch` at the provider adapter boundary when testing normalization.

## TDD workflow

1. **Identify the boundary** — pure logic? wire contract? route + DB?
2. **Write one failing test** describing user-visible or API-consumer behavior.
3. **Run it and watch it fail** — for the reason you expect. A test that passes before the fix is testing nothing; one that fails for an unrelated reason (missing fixture, unhydrated harness, an insert the FK rejects anyway) will pass later without proving the fix. Read the assertion diff, not just the red.
4. **Implement minimally** until green.
5. **Refactor** without adding behavior — the tests you just wrote are the net.

**Pure refactors** (moving state, extracting a predicate, collapsing two passes into one) have no red step, because behavior must not change. Pin the contract most at risk with a characterization test, confirm it is **green before** you touch anything, then refactor under it. Do not manufacture a failing test to make the sequence look orthodox.

### Boundary decision tree

- Touches shared schema? → update schema + integration test via `inject()`; no golden files
- Binary codec or serialization transform? → unit/contract round-trip test
- New/changed route? → integration test asserting observable behavior
- Provider normalization? → adapter unit test with inline vendor JSON fixture
- UI-only date/format math? → `ui/lib` unit test
- Shared form draft/discard/leave guard? → UI hook/kit unit test (jsdom)
- Duplicated algorithm API ↔ UI? → parity contract test; consider moving to `shared`
- Page-level “click Save”? → skip (thin glue); extend API + kit tests instead

### Naming

- Files: `*.test.ts` / `*.test.tsx`
- `describe` = resource or behavior area
- `it` / `test` = observable outcome

## Provider testing

- Mock HTTP at the provider client boundary (e.g. SurePet timeline JSON → stored event rows)
- Route tests stay provider-agnostic — no `provider === 'surepet'` gates in generic routes
- ESPHome fixture harness (`analyzerHarness.test.ts`) is opt-in; household telemetry stays gitignored

## Anti-patterns

- Line-by-line route handler unit tests
- React render snapshots / className inventory
- Tautological “renders the title prop” tests
- Coverage % gates or coverage-motivated suites
- Schema golden JSON fixtures
- Real cloud calls in CI
- Testing implementation details (internal call order, private helpers)
- Rationale essays in test files — a paragraph arguing why the behavior is right, or restating a rule that already lives on the code under test. The `it(...)` name is the explanation; see [AGENTS.md → Code comments](AGENTS.md#code-comments)
- Deleting a test alongside an unrelated change. Removing coverage is its own commit with its own reason, not a side effect
- Parallel `Insert*Options` / fixture interfaces that duplicate Kysely `New*` or shared event types
- `as unknown as IntegrationManager` test doubles — inject account managers on the real manager instead
- `toISOString().split('T')[0]` in test fixtures (use `date-fns` `format` for local calendar dates)
- Playwright (or page RTL) to re-assert API business rules

## Commands

```bash
npm test                  # all workspaces
npm run test:unit         # unit tests only (all workspaces)
npm run test:integration  # API integration tests only
```

**Focused runs** — pass a file or directory to `node --test` instead of adding npm scripts:

```bash
# from packages/api
node --experimental-strip-types --test src/services/devices/providers/esphome/test/analyzerSmoke.test.ts
node --experimental-strip-types --test src/services/devices/providers/esphome/test/
node --experimental-strip-types --test 'src/services/**/surepet/**'

# from packages/ui
tsx --tsconfig ./tsconfig.app.json --import ./src/test/register.ts --test src/hooks/form/test/
```

**PR gate:** `npm run lint && npm run typecheck && npm run test`

## Examples

| Test                                         | Type        | File                                                                             |
| -------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| Known cat plateau → eliminating period       | Unit        | `packages/api/src/services/devices/providers/esphome/test/analyzerSmoke.test.ts` |
| Pets CRUD via inject                         | Integration | `packages/api/test/integration/pets.test.ts`                                     |
| Litterbox encode → API serialize → UI decode | Contract    | `packages/api/test/contracts/` (Phase 2)                                         |
| Draft dirty + discard confirm                | Unit (UI)   | `packages/ui/src/hooks/form/test/useDraftForm.test.tsx`                          |
| Confirm while busy blocks Escape             | Unit (UI)   | `packages/ui/src/components/ui/test/ConfirmDialog.test.tsx`                      |
| Food calorie bounds from weight              | Unit (API)  | `packages/api/src/services/analytics/test/dailyMetricTrends.test.ts`             |
