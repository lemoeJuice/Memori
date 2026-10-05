# Memori

Memori is a local-first life journal built around time, places, photos and optional notes. Memories and photos are stored in the browser's IndexedDB; the application has no journal backend or cloud sync.

## Run locally

```sh
npm install
npm run dev
```

To enable Memory Map, open **Settings → 地图服务**, enter your own AMap Web JS API Key and `securityJsCode`, then save or test the configuration. No developer credentials or environment variables are required. Without a key, the map provides a Settings entry point; other features continue to work.

Map credentials are BYOK and stored only in this browser's localStorage, separately from memories and backups. They are not uploaded to Memori. Map loading uses them in requests to AMap or the configured proxy. Direct browser use of `securityJsCode` is visible to the current user in DevTools. An optional `serviceHost` (for example `https://your-proxy.example.com/_AMapService`) takes priority and lets your proxy hide the security code. No map backend is required for this release; if Memori later supplies shared project credentials, a default proxy should be considered. Never commit real credentials. The AMap adapter is isolated under `src/map`; raw coordinates in IndexedDB remain WGS84 and are converted only for map display.

## Build

```sh
npm run build
```

Backups are ZIP archives containing a versioned `memori-backup.json` manifest and referenced photo files. Restoring a backup replaces local entries, photos and ordinary settings on this device; map credentials are neither exported nor replaced.
