# Memori

Memori is a local-first life journal built around time, places, photos and optional notes. Memories and photos are stored in the browser's IndexedDB; the application has no journal backend or cloud sync.

## Run locally

```sh
npm install
npm run dev
```

Create `.env.local` from `.env.example` only if you want to enable the Memory Map. Add an AMap JS API 2.0 Web key as `VITE_AMAP_KEY`. Without a key, the wall, settings, local search and backup features continue to work, while the map explains how to connect a provider.

For production, do not expose `VITE_AMAP_SECURITY_CODE` in a public build. Configure an AMap security proxy and provide its URL through `VITE_AMAP_SERVICE_HOST` instead. The AMap adapter is isolated under `src/map`; raw coordinates in IndexedDB remain WGS84 and are converted only for map display.

## Build

```sh
npm run build
```

Backups are ZIP archives containing a versioned `memori-backup.json` manifest and referenced photo files. Restoring a backup replaces local entries, photos and settings on this device.
