# Cat Health API

Backend for Pet Assistant: Fastify, SQLite, device providers.

## Environment

Copy the example file and configure as needed:

```bash
cp .env.example .env
```

See `.env.example` for available variables (`SQLITE_PATH`, `MEDIA_PATH`, `MEDIA_TEMP_PATH`, `CORS_ALLOWED_ORIGINS`).

## Database

```bash
npm run migrate          # apply migrations
npm run migrate:down     # roll back one migration
npm run reset-db         # delete DB and re-migrate
npm run backup-db        # snapshot database.sqlite
npm run restore-db       # restore from backup
```

## Tests

```bash
npm run test              # unit + integration
npm run test:unit         # all unit tests under src/**/test/
npm run test:integration  # route + DB tests (test/integration/)
```

See [TESTING.md](../../TESTING.md) for focused runs (`node --test <path>`) and the opt-in ESPHome fixture harness.

## Integrations

See [docs/integrations.md](../../docs/integrations.md) at the repo root for provider disclaimers (including unofficial SurePet cloud access).
