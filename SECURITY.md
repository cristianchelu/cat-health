# Security Policy

## Supported versions

This project is under active development. Security fixes are applied on the default branch.

## Reporting a vulnerability

If you discover a security issue, please open a private report via GitHub Security Advisories for this repository, or contact the maintainer through GitHub.

Please do not open public issues for undisclosed vulnerabilities.

## Deployment model

Pet Assistant is designed for **trusted homelab / LAN use**, not exposure to the public internet.

### No API authentication

The Fastify API does not implement authentication or authorization. Any client that can reach the API can read and modify data, including:

- Pet profiles and health events
- Device configuration
- Provider account credentials stored in SQLite (`provider_account.config`)

### Credentials in the database

Integration credentials (SurePet email/password/token, inference API keys, ESPHome encryption keys, camera SSH passwords or key paths) are persisted in the local SQLite database. Account GET endpoints return stored configuration to the UI.

Treat the host running this application like any other secrets-bearing service on your network: firewall it, do not port-forward it without additional protection, and restrict filesystem access to the database file.

### Recommended practices

- Run behind your home network or VPN only
- Set `CORS_ALLOWED_ORIGINS` to explicit browser origins you control
- Keep the SQLite database and `data/media/` directory off shared backups you do not trust
- Rotate provider credentials if a host or backup is compromised
