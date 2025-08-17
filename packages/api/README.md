# Cat Health API

## Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit the `.env` file with your actual values:

- `INFLUX_TOKEN`: Your InfluxDB access token (required for migration scripts)
- `CAMERA_IP`: IP address of your camera for video recording (optional)

## Migration Scripts

### Litterbox Event Migration

The `migrate.ts` script migrates litterbox events from InfluxDB to the SQLite database and optionally downloads corresponding video recordings.

#### Setup

1. Configure environment variables in `.env` file
2. Ensure you have SSH access to the IP camera (for video downloads)
3. Install `ffmpeg` on your system (for video processing)

#### Basic Usage

```bash
npm run litterbox-migrate --workspace=api
```

#### What it does

1. **Event Migration**: Extracts litterbox use and maintenance events from InfluxDB
2. **Data Processing**: Processes weight sensor data and determines event types
3. **Video Downloads** (when `CAMERA_IP` is configured in `.env`):
   - Downloads video recordings for each event using the `littercam.sh` script
   - Creates videos with filename format: `event_YYYYMMDD_HHMMSS_{use|maintenance}.mp4`
   - Stores videos in `packages/api/data/recordings/`
   - Skips downloads for events that already have videos

#### Configuration

Environment variables (set in `.env` file):
- `INFLUX_TOKEN`: Required for InfluxDB access
- `CAMERA_IP`: Optional, enables video downloads (e.g., "192.168.1.101")

#### Requirements

For video downloads:
- SSH access to the IP camera
- `ffmpeg` installed on the system
- The `littercam.sh` script in the same directory
