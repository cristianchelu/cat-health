# Integrations

## Sure Petcare (SureFeed / SureFlap cloud)

The SurePet provider uses an **unofficial, reverse-engineered** HTTP API. It is not affiliated with, endorsed by, or supported by Sure Petcare Ltd.

- Use at your own risk; cloud APIs may change without notice
- Your Sure Petcare account credentials are stored locally in SQLite
- API constants and event types were informed by community projects such as [DiniFarb/surepetcare](https://github.com/DiniFarb/surepetcare)

Do not use this integration if you are uncomfortable with unofficial cloud access.

## ESPHome

Standard ESPHome device discovery and state via `esphome-client`. Device-specific YAML and firmware live outside this repository.

## Inference (OpenAI-compatible)

Optional pet recognition via any OpenAI-compatible HTTP API. API keys are stored in the local database.

## Cameras (Thingino and others)

Camera integrations may use HTTP snapshot URLs and optional SSH for clip retrieval. Credentials and key paths are stored locally.
