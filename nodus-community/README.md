# Tauri + Vanilla

This template should help get you started developing with Tauri in vanilla HTML, CSS and Javascript.

## Recommended IDE Setup

-   [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Development with Vite + Tauri

This repository uses Vite for frontend development and Tauri for the native shell. The project is set up so you can run a fast Vite dev server during development, and build static assets for Tauri for production.

Recommended workflow (two terminals):

1. Start the Vite dev server (serves the frontend at http://localhost:5173):

```bash
npm run dev
```

2. In a second terminal, start the Tauri dev command (loads the Vite server automatically):

```bash
npm run tauri -- dev
```

When `tauri dev` runs it will use the `devPath` defined in `src-tauri/tauri.conf.json` (http://localhost:5173) so the native window loads the live Vite server.

Single-command dev (Vite + Tauri)

If you'd rather start Vite and Tauri together with one command, a convenience script is provided:

```bash
npm run dev:all
```

This runs Vite and Tauri in parallel using `concurrently` so you get the frontend dev server and the native window in one shot.

Robust dev startup (wait for Vite)

The `dev:all` script is implemented to wait for the Vite dev server to be ready before launching Tauri. This avoids the native window attempting to load the app before the dev server is listening.

What it runs under the hood:

-   Starts Vite (`npm run dev`).
-   Runs `wait-on http://localhost:5173` and only when that resolves starts `npm run tauri -- dev`.

Use the shortcut:

```bash
npm run dev:all
```

If you prefer the explicit two-step flow you can still run `npm run dev` and `npm run tauri -- dev` in separate terminals.

Building production bundles

1. Produce the frontend static bundle with Vite:

```bash
npm run build
```

2. Then build the native app with Tauri (this will package the files from `src-tauri.build.frontendDist`, which is set to `../dist`):

```bash
npm run tauri -- build
```

Static or individual-file usage

-   If you prefer to open `src/index.html` directly in a browser or serve the `src/` tree via a simple static server, the repo includes an `importmap` in `src/index.html` that maps the `@platform/`, `@shared/` and `@features/` aliases to the `src/` folders so bare specifiers resolve in supporting browsers.
-   To serve the `src/` tree locally without Vite you can use a small static server (example using `http-server`):

```bash
npx http-server ./src -p 8080
# then open http://localhost:8080
```

Notes

-   The Vite config (`vite.config.js`) defines path aliases so you can keep imports like `@platform/actions/ActionDispatcher.js` in source. Vite rewrites those during dev and build. The importmap in `src/index.html` is a compatibility fallback for direct static serving.
-   If you want me to change the `frontendDist` path or tweak the dev port, tell me which values you prefer and I'll update `src-tauri/tauri.conf.json` and `vite.config.js` accordingly.

## Storage (SQLite default)

The engine uses SQLite by default for on-disk persistence. This repository defaults to a local file named `./nodus.sqlite` so development is simple and reproducible.

Environment overrides

-   To change the DB file path, set the `NODUS_SQLITE_DB` environment variable before starting the app. Example (PowerShell):

```powershell
$env:NODUS_SQLITE_DB = 'C:\Users\you\AppData\Local\nodus\nodus.sqlite'
npm run dev:all
```

-   To explicitly select which registered storage backend to use (for example `sqlite` or `memory`), set `NODUS_STORAGE_BACKEND`:

```powershell
$env:NODUS_STORAGE_BACKEND = 'sqlite'
npm run dev:all
```

Why the default is `./nodus.sqlite`

-   It's simple and predictable for contributors and CI.
-   You can always override it with `NODUS_SQLITE_DB` for packaged installs or platform-specific data locations.

Suggested platform-specific locations (optional)

-   Windows: `%LOCALAPPDATA%\nodus\nodus.sqlite`
-   macOS: `~/Library/Application Support/nodus/nodus.sqlite`
-   Linux: `$XDG_DATA_HOME/nodus/nodus.sqlite` or `~/.local/share/nodus/nodus.sqlite`

If you want me to change the default to a platform-specific path instead, say the word and I'll update the startup logic accordingly.
