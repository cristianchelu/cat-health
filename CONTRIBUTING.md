# Contributing

Thanks for your interest in Pet Assistant.

## Development setup

Requirements: Node.js (see `.nvmrc` if present), npm workspaces.

```bash
npm install
npm run migrate        # create / update SQLite schema
npm run dev            # API on :3000, UI via Vite
```

Environment: copy `packages/api/.env.example` to `packages/api/.env` and set `CORS_ALLOWED_ORIGINS` for any non-local UI origin.

## Workspace layout

| Package           | Role                                      |
| ----------------- | ----------------------------------------- |
| `packages/api`    | Fastify backend, SQLite, device providers |
| `packages/ui`     | React frontend                            |
| `packages/shared` | Shared types and schemas                  |

## Commands

```bash
npm run lint           # ESLint across workspaces
npm run typecheck      # TypeScript check
npm run test           # API unit tests (see below)
npm run migrate        # Run database migrations
npm run reset-db       # Wipe DB and re-migrate
```

### API tests

The root `npm test` runs API test suites. Individual suites:

```bash
npm run test:analyzer -w api   # StateAnalyzer smoke + optional fixture harness
npm run test:feeding -w api    # SurePet feeding + food logic
npm run test:coverage -w api   # Analytics coverage tests
```

The ESPHome fixture harness (`analyzerHarness.test.ts`) is skipped unless you export local fixtures (`visits.csv`, `streams/`, `bouts.csv`). Those paths are gitignored and may contain household telemetry.

## Code conventions

See [AGENTS.md](AGENTS.md) for architecture, CSS, API patterns, and provider integration boundaries.

## License

Pet Assistant is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). You may use, modify, and distribute the software under those terms. If you run a modified version as a network service, you must offer corresponding source to users who interact with it over the network.

Third-party components may use other licenses — see [NOTICE](NOTICE).

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) with a package scope:

```
type(scope): imperative subject
```

- **type** — `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`
- **scope** — `api`, `ui`, `shared`, or a cross-cutting scope such as `docs` or `deps`
- **subject** — imperative mood, lowercase, no trailing period; start with a verb

Examples:

```
fix(ui): hide stale SureFeed compartment selectors
fix(api): refresh SurePet feeder config without disconnect
feat(shared): add feeder food compartment schema
docs(contributing): document semantic commit format
```

Use the body for context when the subject alone is not enough (what broke, why the change matters).

## Pull requests

- Keep changes focused
- Use semantic commit messages (see above); squash-merge PR titles should follow the same format
- Match existing file and import conventions
- Run `npm run lint` and `npm run typecheck` before submitting
