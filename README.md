# Calendarr

A polished, iframe-friendly release calendar for Sonarr and Radarr.

## Docker Compose

Create a `.env` file next to `compose.yaml`:

```env
SONARR_INSTANCES=[{"name":"4K","url":"http://sonarr-4k:8989","apiKey":"your-4k-sonarr-api-key"},{"name":"1080p","url":"http://sonarr-1080p:8989","apiKey":"your-1080p-sonarr-api-key"}]
RADARR_INSTANCES=[{"name":"4K","url":"http://radarr-4k:7878","apiKey":"your-4k-radarr-api-key"},{"name":"1080p","url":"http://radarr-1080p:7878","apiKey":"your-1080p-radarr-api-key"}]
MEDIA_NETWORK=media
CALENDARR_PORT=3000
```

`MEDIA_NETWORK` must be a Docker network shared by Calendarr, Sonarr, and Radarr.

Start Calendarr:

```sh
docker compose up -d
```

Open `http://localhost:3000`. Either Sonarr or Radarr may be left unconfigured.

## Homarr

Calendarr is designed for a Homarr iframe. Add an iframe widget with:

```text
http://<docker-host>:3000/?embed=1
```

The embed layout, saved views, dots mode, custom colors, and automatic refresh work directly inside Homarr.

## Arcane

Create a project from `compose.yaml`, add the values from `.env.example` to its environment configuration, and deploy. Pull and redeploy to receive updates.

No volumes are required. Calendarr stores preferences in browser storage and keeps API keys on the server.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Internal web server port |
| `SONARR_INSTANCES` | `[]` | JSON list of Sonarr instances (`name`, `url`, `apiKey`) |
| `RADARR_INSTANCES` | `[]` | JSON list of Radarr instances (`name`, `url`, `apiKey`) |
| `MEDIA_NETWORK` | `media` | Shared Docker network |
| `CALENDARR_PORT` | `3000` | Published host port |
