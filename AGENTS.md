# Hellstats

Lightweight cross-platform system monitoring dashboard. Electron + Svelte 5 + Vite, with GSAP animations and a Three.js particle background. Design system ported from AdaanIDE (6 themes, glassmorphism, glow effects).

## Structure

```
electron/     # Electron main process (CJS, compiled by tsc → dist/)
src/          # Svelte 5 renderer (vite dev server / built to dist-web/)
scripts/      # launch.sh — unsets ELECTRON_RUN_AS_NODE before launching
```

## Commands

```bash
npm install                          # Install deps (then: node node_modules/electron/install.js if binary missing)
npm run dev                          # Dev: vite dev server + electron (concurrently)
npm run dev:electron                 # Launch electron only (after tsc + vite already running)
npm run build                        # Build web + tsc + electron-builder
npm run build:mac                    # Build macOS (.dmg + .zip)
npm run build:win                    # Build Windows (.exe + portable)
npm run build:linux                  # Build Linux (.AppImage + .deb)
npm run typecheck                    # tsc --noEmit
```

## Architecture

- **Main process** (`electron/main.ts`): CJS, compiled with `tsc` to `dist/`. Uses `require("electron")` directly (ESM interop helpers interfere). Collects system metrics via `systeminformation` and exposes them via IPC (`metrics:get`).
- **Preload** (`electron/preload.ts`): `contextBridge` exposes `window.hellstats` with `getMetrics()`, `isDev()`, and `platform`. `contextIsolation: true`, `nodeIntegration: false`.
- **Renderer** (`src/`): Svelte 5 app with Vite. Three.js particle background (theme-aware), GSAP entrance animations and value tweens, 4 metric cards (CPU, RAM, Storage, Network) with progress rings and sparklines.
- **launch.sh**: Unsets `ELECTRON_RUN_AS_NODE` (set by some terminals/IDEs) so Electron runs as a GUI app, not pure Node.
- **Themes**: 6 themes (Retrowave, Ghibli, Fiesta, Dawn, Synthwave '84, Solarized Dark) via CSS custom properties on `:root[data-theme]`. Persisted to `localStorage`. Same glassmorphism + glow system as AdaanIDE.
- **Single instance lock**: Only one Hellstats window at a time.
- **Cross-platform**: `systeminformation` works on macOS, Windows, and Linux. Window title bar adapts per platform (`hiddenInset` on macOS, default elsewhere).

## Metrics

Polled every 1.5s via IPC:
- **CPU**: overall usage %, per-core %, temperature, clock speed, model name
- **RAM**: total/used/free, swap total/used
- **Storage**: largest filesystem total/used/free, read/write throughput
- **Network**: default interface rx/tx bytes per second, total rx/tx
- **Uptime**: system uptime
