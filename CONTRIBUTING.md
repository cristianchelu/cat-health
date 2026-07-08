# Contributing

Thanks for your interest in Pet Assistant.

## Development setup

Requirements: Node.js (see `.nvmrc` if present), npm workspaces.

```bash
npm install
npm run migrate        # create / update SQLite schema
npm run seed:demo      # demo household (empty DB); pet avatars from CATAAS when reachable
npm run seed:demo -- --force   # replace existing data with demo household
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
npm run test           # all workspaces (see TESTING.md)
npm run migrate        # Run database migrations
npm run reset-db       # Wipe DB and re-migrate
npm run seed:demo      # Populate demo household (requires empty DB)
```

### Tests

See [TESTING.md](TESTING.md) for philosophy, boundaries, and harness usage.

```bash
npm test                       # all workspaces
npm run test:unit              # unit tests only
npm run test:integration       # API route + DB tests
```

To run a single file or directory, pass a path to `node --test` (from `packages/api`):

```bash
node --experimental-strip-types --test src/services/devices/providers/esphome/test/analyzerSmoke.test.ts
```

The ESPHome fixture harness is skipped unless you export local fixtures (`visits.csv`, `streams/`, `bouts.csv`). Those paths are gitignored and may contain household telemetry.

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
