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

Generic cameras use an HTTP snapshot URL. Thingino cameras talk to the WebUI over HTTP (`origin` + API key as `?token=`). The hub keeps the API key; the browser never sends `?token=` to the camera.

Control and recorder layout come from the Camera Agent (`/x/agent.cgi/api/v1/config` and `/runtime/all`). Snapshots try `/x/ch0.jpg` then `/x/dl0.jpg` on every backend. Visit clips are listed and downloaded through tool-file-manager `cd=` / `dl=` from one of the two recording trees Thingino ships: the Prudynt recorder on the stable `ciao` branch writes `{mount}/{device_path}/YYYY/MM/DD/HH-MM-SS.mp4` (prudynt-t's `record` default), and the Raptor recorder on `master` writes under an absolute `device_path` as `YYYY-MM-DD/HH-MM-SS.mp4`. Layouts are named for the recorder, which is what `backend.name` reports. Raptor reports `filename: null` and an absolute `device_path`, so it is recognised from the agent's `backend.name`; an absolute path on any other backend is a custom path, which is not supported. Only Raptor's 24/7 recorder tree is read -- the motion clips its RMD writes to `{device_path}/clips/` are left alone. The prudynt-only `/x/tool-record.cgi` is a fallback for older Ciao images that omit agent storage config.
