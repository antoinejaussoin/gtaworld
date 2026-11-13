# gtaworld

Top-down driving on the real world. Drop a pin anywhere, and streets, buildings, woods, and water stream in at real size from that spot. The same OpenStreetMap snapshot always builds the same streets, parked cars, and pedestrians.

The game client is one TypeScript app:

- On a Mac, open it in a browser, or build a native window with Tauri.
- The same project targets Windows and Linux.
- The Vite build is the web build. Nothing has to be rewritten to host it.

## Play

```bash
npm install
npm run dev
```

Open http://127.0.0.1:1420. The first visit to a place needs a connection. Tiles are cached in IndexedDB for 30 days, up to about 200 MB, so starting from the same pin again does not download them twice.

| Key | Action |
| --- | --- |
| WASD or arrows | Walk, or accelerate / brake / steer |
| E | Enter or exit the nearest car |
| Shift | Handbrake |
| C | Toggle the camera between north-up and behind the car |
| Esc | Return to the pin map |

Search uses Nominatim. Map tiles are the pinned OpenFreeMap planet `20261101_080013_pt` (OpenMapTiles, zoom 14). Change `SNAPSHOT` in [src/world/config.ts](src/world/config.ts) when you want a newer extract. Until you do, the world stays put.

## Desktop

Install Node and Rust, then:

```bash
npm run tauri dev
npm run tauri build
```

`tauri dev` and `tauri build` work on macOS, Windows, and Linux. A Mac `.app` has to be built on macOS (Apple's SDK). The browser build is the same client the window loads.

## Tests

```bash
npm test
```

## Credits

Map data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright). Vector tiles © [OpenFreeMap](https://openfreemap.org/). Place search © Nominatim. The game draws original shapes on top of that geometry.
