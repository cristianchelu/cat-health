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

Generic cameras use an HTTP snapshot URL. Thingino cameras talk to the WebUI over HTTP (`origin` + API key as `?token=`): snapshots from `/x/ch0.jpg`, recorder layout from `/x/tool-record.cgi`, agent JSON through `/x/agent.cgi/api/v1/…`, and visit clips from those recorder directories via tool-file-manager `cd=` / `dl=`. The hub keeps the API key; the browser never sends `?token=` to the camera. Custom recording paths are not supported.
