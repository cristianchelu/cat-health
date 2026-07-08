# Testing

Agent-facing guide for how we test Pet Assistant: what to cover, where tests live, and how to run them.

## North star

Test **behavior at meaningful boundaries**. Prefer confidence over line coverage. Tests must be fast and run on potato hardware (Raspberry Pi class hosts) with no external cloud dependencies in CI.

## Test pyramid

| Layer               | What                                                                      | Where                                           |
| ------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| **Unit**            | Pure functions, deterministic edge cases                                  | Colocated `test/` or `*.test.ts` next to source |
| **Contract**        | Cross-package serialization, algorithm parity (gaps TypeBox cannot catch) | `packages/api/test/contracts/`                  |
| **API integration** | Full route stack via `inject()` + temp SQLite                             | `packages/api/test/integration/`                |
| **Browser E2E**     | Deferred (Playwright smoke flows later)                                   | —                                               |

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

- **Unit:** `lib/utils.ts` (`createDayRange`), `untrackedIntervals.ts`, `decodeLitterboxRawData.ts`, `analyzeWaterSegments.ts`
- **Not:** React component render trees or snapshots (defer until integration tests cannot reach the behavior)

## API integration harness

Phase 0 DI enables injecting a temp database. Use helpers in `packages/api/test/helpers/`:

```ts
import { after, before } from "node:test";
import {
  createTestApp,
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from "../helpers/testDb.ts";
import { insertPet } from "../helpers/fixtures.ts";

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

**Seed factories** (`fixtures.ts`): `insertPet()`, `insertLitterboxEvent()`, etc. First argument is always the `db` instance.

**What is in the slice:** Fastify routes, real migrations, real SQLite, TypeBox response validation.

**What is out:** browser, Vite, production DB, real provider clouds. Mock `fetch` at the provider adapter boundary when testing normalization.

## TDD workflow

1. **Identify the boundary** — pure logic? wire contract? route + DB?
2. **Write one failing test** describing user-visible or API-consumer behavior.
3. **Implement minimally** until green.
4. **Refactor** without adding behavior.

### Boundary decision tree

- Touches shared schema? → update schema + integration test via `inject()`; no golden files
- Binary codec or serialization transform? → unit/contract round-trip test
- New/changed route? → integration test asserting observable behavior
- Provider normalization? → adapter unit test with inline vendor JSON fixture
- UI-only date/format math? → `ui/lib` unit test
- Duplicated algorithm API ↔ UI? → parity contract test; consider moving to `shared`

### Naming

- Files: `*.test.ts`
- `describe` = resource or behavior area
- `it` / `test` = observable outcome

## Provider testing

- Mock HTTP at the provider client boundary (e.g. SurePet timeline JSON → stored event rows)
- Route tests stay provider-agnostic — no `provider === 'surepet'` gates in generic routes
- ESPHome fixture harness (`analyzerHarness.test.ts`) is opt-in; household telemetry stays gitignored

## Anti-patterns

- Line-by-line route handler unit tests
- React render snapshots
- Schema golden JSON fixtures
- Real cloud calls in CI
- Testing implementation details (internal call order, private helpers)
- `toISOString().split('T')[0]` in test fixtures (use `date-fns` `format` for local calendar dates)

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
```

**PR gate:** `npm run lint && npm run typecheck && npm run test`

## Examples

| Test                                         | Type        | File                                                                             |
| -------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| Known cat plateau → eliminating period       | Unit        | `packages/api/src/services/devices/providers/esphome/test/analyzerSmoke.test.ts` |
| Pets CRUD via inject                         | Integration | `packages/api/test/integration/pets.test.ts` (Phase 2)                           |
| Litterbox encode → API serialize → UI decode | Contract    | `packages/api/test/contracts/` (Phase 2)                                         |
