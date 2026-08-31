# MVS ERP — desktop wrapper (Electron)

Wraps the built vite frontend (`dist/`) into a native desktop application
(Windows / macOS / Linux). The app works online and offline (IndexedDB +
local http) and connects to an external backend via API_URL (set on the
"Synchronization" screen or in the pre-login settings).

## How it works

- `main.js` (main process) starts a local HTTP server on `127.0.0.1` serving
  `../dist` (the built frontend). This is required because the frontend relies
  on root paths `/precache-manifest.json`, `/assets/*` — over `http` they work
  without code changes (unlike `file://`).
- `preload.js` exposes a minimal `window.erpDesktop` API to the renderer via
  `contextBridge` (the `isElectron` flag + safeStorage access for the password).
- There is no Service Worker (it was removed from the project): offline support
  comes from the local http server + IndexedDB (data cache and mutation queue).

## Building

Build the frontend first:

```bash
cd ../            # services/frontend
npm run build     # → dist/
```

Then build the installers (from `desktop/`):

```bash
npm install        # electron + electron-builder (already in devDependencies)
npm run dist       # all platforms
npm run dist:win   # Windows only (NSIS .exe)
npm run dist:mac   # macOS (dmg + zip)
npm run dist:linux # Linux (AppImage + deb)
```

Ready artifacts go to `release/` (plain `npm run dist` writes to the `release/`
root); `build-portable.sh` additionally lays out each release into a
**per-version directory** `release/<version>/`.

### Portable + single-file — Windows and Linux

`build-portable.sh` builds a release with a **version**. All artifacts of one
version live in a single directory `release/<version>/`, e.g.:

```
release/1.0.2/
├── MVS ERP-1.0.2-linux-x86_64.AppImage   # Linux single file
├── MVS ERP-1.0.2-win-x64.exe             # Windows single self-contained .exe
├── MVS ERP-1.0.2-win-x64.zip             # Windows portable archive
├── linux-unpacked/                       # Linux portable folder
└── win-unpacked/                         # Windows portable folder
```

Each of the **4 parts** of a release is toggled by its own flag; **Linux is
enabled by default, Windows disabled**. Explicit flags add parts to the Linux
default:

| Part | Artifacts | Flag | Default |
|---|---|---|---|
| Linux portable | `linux-unpacked/` | `--linux-portable` | on |
| Linux single-file | `*-linux-x86_64.AppImage` | `--linux-appimage` | on |
| Windows portable | `win-unpacked/` + `*-win-x64.zip` | `--win-portable` | off |
| Windows single-file | `*-win-x64.exe` (best-effort) | `--win-exe` | off |

Shorthands: `--win` = `--win-portable --win-exe`; `--linux` = both Linux flags.

The **version** is taken from `desktop/package.json` (semver) and by default
is **incremented** on each build (patch):

```bash
./build-portable.sh                 # Linux (both parts), version = patch bump
./build-portable.sh --win           # Linux + both Windows parts
./build-portable.sh --win-portable  # Linux + Windows portable (zip + folder)
./build-portable.sh --win-exe       # Linux + single-file Windows .exe
./build-portable.sh --version 2.1.0 # build exactly 2.1.0
./build-portable.sh --bump minor    # increment minor
./build-portable.sh --no-bump       # current version unchanged
./build-portable.sh --build-web     # force rebuild of dist/
./build-portable.sh --clean         # clean release/ before building
```

The version is passed into the web build (`APP_VERSION` → `__APP_VERSION__` and
`precache-manifest.json`), so "App/build version" on the "Synchronization"
screen matches the artifact version. The script does not commit the version —
commit the increment separately (`chore(desktop): release vX.Y.Z`).

Portable targets do not need wine: `zip`/`dir`/portable/AppImage are built on
a Linux host. The single-file Windows `.exe` (the `portable` target) is built
in a separate invocation; if the environment cannot build it, the script
continues with zip and prints a warning. (The NSIS `.exe` installer is NOT
portable; it needs wine + makensis on Linux — that is a separate
`npm run dist:win`.)

Dev run (without packaging):

```bash
npm start          # opens an Electron window with the locally served dist/
```

## Auto-sync password

The auto-sync password is stored **not in the browser** but in the main
process via `safeStorage` (OS-level encryption, file in `userData`), and the
renderer can only access it over IPC
(`window.erpDesktop.password.get/set/clear`). In a plain browser (non-Electron)
the password is not stored at all.

Auto-sync credentials **are saved automatically at login** (on the login page):
the login to localStorage, the password to safeStorage; there is no separate
input on the "Synchronization" screen. On startup the app automatically
restores the session from the saved credentials
(`ensureDesktopAutoSyncSession` in `src/offline/sync.ts`) if auto-sync is
enabled and no session exists — and syncs without a manual login. After an
explicit "Log out", auto-sync does not log in again until the next manual
login. Without a network, the login page offers "Log in offline" — a local
session with cache and a mutation queue.

## Requirements

- Node.js ≥ 20 (for build/packaging).
- Building the macOS installer requires macOS; the Windows .exe is easier to
  build on Windows (electron-builder can cross-build with limitations).
- safeStorage works where the OS provides encryption (macOS Keychain, Windows
  DPAPI, Linux — keyring); if no key is available, the password is simply not
  saved.