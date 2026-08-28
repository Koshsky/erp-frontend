#!/usr/bin/env bash
#
# Builds MVS ERP release versions from the Electron wrapper (Windows + Linux).
#
#  What it does:
#    1. Determines the app version (see "Version" below).
#    2. Builds the web frontend (services/frontend/dist/) with the same version
#       (unless already built or --build-web is passed).
#    3. Checks/installs the Electron wrapper dependencies (desktop/).
#    4. Runs electron-builder for the enabled release parts (flags below).
#       All artifacts of one release go into ONE directory named after the
#       specific version: release/<version>/.
#
#  Release parts and flags (Linux is ON by default, Windows OFF; explicit
#  flags add parts to the Linux default):
#    --linux-portable   Linux portable folder linux-unpacked/          (default on)
#    --linux-appimage   Linux single file *.AppImage                  (default on)
#    --win-portable     Windows portable: win-unpacked/ + *.zip       (default off)
#    --win-exe          Windows single self-contained *.exe           (default off)
#    --win              shorthand for --win-portable --win-exe
#    --linux            explicit enable of both Linux flags (no-op, already default)
#
#  Version:
#    - source — desktop/package.json (semver); artifacts and UI get the same one
#      (in dist via env APP_VERSION);
#    - by default every build increments patch (1.0.0 -> 1.0.1);
#    - --version X.Y.Z — exact version (no increment);
#    - --bump minor|major|patch — explicit increment type; --no-bump — unchanged.
#    The script does not commit the version: commit the bump separately
#    (e.g. chore(desktop): release v1.0.1).
#
#  Usage:
#    ./build-portable.sh                     # Linux (both parts); version = patch bump
#    ./build-portable.sh --win-portable      # Linux + Windows portable (zip+folder)
#    ./build-portable.sh --win-exe           # Linux + single Windows .exe (best-effort)
#    ./build-portable.sh --win               # Linux + both Windows parts
#    ./build-portable.sh --version 2.1.0     # build exactly 2.1.0
#    ./build-portable.sh --no-bump           # current version as is
#    ./build-portable.sh --bump minor        # increment minor
#    ./build-portable.sh --build-web         # force rebuild of dist/
#    ./build-portable.sh --clean             # clean release/ before building
#
#  Artifacts (release/<version>/ — all files of one release in one directory):
#    Windows: MVS ERP-<v>-win-x64.zip (portable archive) + win-unpacked/
#             MVS ERP-<v>-win-x64.exe (single self-contained .exe; best-effort)
#    Linux:   MVS ERP-<v>-linux-x86_64.AppImage (single file) + linux-unpacked/
#
#  Note on wine: zip/dir/portable/AppImage targets do not need wine on a
#  Linux host; the single Windows .exe (portable) is built in a separate
#  invocation and, when environment tools are unavailable, does not break the
#  other artifacts. The NSIS installer (npm run dist:win) is NOT portable and
#  needs wine/makensis or a Windows host — deliberately not built here.
#
set -euo pipefail

# Script directory (desktop/) and the frontend root
DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$DESKTOP_DIR/.." && pwd)"
OUT_DIR="$DESKTOP_DIR/release"

# electron/electron-builder cache. By default they put binaries into ~/.cache,
# which is read-only in many environments (sandbox/CI). Redirect into the
# working tree (this directory is gitignored). @electron/get on Linux reads
# XDG_CACHE_HOME (envPaths) — that is what we set, plus fallback variables.
export XDG_CACHE_HOME="$DESKTOP_DIR/.cache"
export ELECTRON_CACHE="$XDG_CACHE_HOME/electron"
export electron_config_cache="$XDG_CACHE_HOME/electron"
export ELECTRON_BUILDER_CACHE="$XDG_CACHE_HOME/electron-builder"
mkdir -p "$XDG_CACHE_HOME" "$ELECTRON_BUILDER_CACHE"

# Release parts: Linux on by default, Windows off
LINUX_PORTABLE=1
LINUX_APPIMAGE=1
WIN_PORTABLE=0
WIN_EXE=0

BUILD_WEB=0
CLEAN=0
BUMP_TYPE="patch"
BUMP=1
OVERRIDE_VERSION=""

for arg in "$@"; do
  case "$arg" in
    --linux-portable)  LINUX_PORTABLE=1 ;;
    --linux-appimage)  LINUX_APPIMAGE=1 ;;
    --win-portable)    WIN_PORTABLE=1 ;;
    --win-exe)         WIN_EXE=1 ;;
    --win)             WIN_PORTABLE=1; WIN_EXE=1 ;;
    --linux)           LINUX_PORTABLE=1; LINUX_APPIMAGE=1 ;;
    --build-web)  BUILD_WEB=1 ;;
    --clean)      CLEAN=1 ;;
    --no-bump)    BUMP=0 ;;
    --bump)       echo "--bump требует аргумент: patch|minor|major" >&2; exit 1 ;;
    --bump=*)     BUMP_TYPE="${arg#--bump=}"; BUMP=1 ;;
    --version)    echo "--version требует аргумент X.Y.Z" >&2; exit 1 ;;
    --version=*)  OVERRIDE_VERSION="${arg#--version=}"; BUMP=0 ;;
    -h|--help)
      sed -n '2,/^set -euo pipefail$/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Неизвестный аргумент: $arg" >&2
      echo "Используйте: $0 [--linux-portable] [--linux-appimage] [--win-portable] [--win-exe] [--win] [--linux] [--build-web] [--clean] [--version X.Y.Z] [--bump patch|minor|major] [--no-bump]" >&2
      exit 1
      ;;
  esac
done

case "$BUMP_TYPE" in
  patch|minor|major) ;;
  *) echo "Некорректный --bump: $BUMP_TYPE (ожидается patch|minor|major)" >&2; exit 1 ;;
esac

# ---------- Version ----------
# Source — desktop/package.json. Default bumps patch; --version disables the
# increment and sets the exact one; --no-bump simply keeps the current one.
CURRENT_VERSION="$(node -p "require('$DESKTOP_DIR/package.json').version" 2>/dev/null || echo '0.0.0')"

if [ -n "$OVERRIDE_VERSION" ]; then
  VERSION="$OVERRIDE_VERSION"
elif [ "$BUMP" -eq 1 ]; then
  echo "== инкремент $BUMP_TYPE: $CURRENT_VERSION -> ... =="
  (cd "$DESKTOP_DIR" && npm version "$BUMP_TYPE" --no-git-tag-version >/dev/null)
  VERSION="$(node -p "require('$DESKTOP_DIR/package.json').version")"
else
  VERSION="$CURRENT_VERSION"
fi

# semver-ish validation (npm already checks on bump; guard for --version)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Некорректная версия: $VERSION (ожидается X.Y.Z)" >&2
  exit 1
fi

# The version goes into the web build: vite writes it into __APP_VERSION__ and
# precache-manifest.json — the UI ("App/build version") matches the artifacts.
export APP_VERSION="$VERSION"

# Per-release directory: all artifacts of this version in one place
REL_DIR="$OUT_DIR/$VERSION"

echo "== MVS ERP: сборка релиза v$VERSION =="
echo "   фронтенд: $FRONTEND_DIR"
echo "   вывод:    $REL_DIR"

if [ "$CLEAN" -eq 1 ] && [ -d "$OUT_DIR" ]; then
  echo "== очистка $OUT_DIR =="
  rm -rf "$OUT_DIR"
fi

# 1. Web frontend
if [ "$BUILD_WEB" -eq 1 ] || [ ! -f "$FRONTEND_DIR/dist/index.html" ]; then
  echo "== собираем web-фронтенд (dist/, версия $APP_VERSION) =="
  (cd "$FRONTEND_DIR" && test -d node_modules || npm install)
  (cd "$FRONTEND_DIR" && npm run build)
else
  echo "== dist/ уже собран (пропуск; --build-web для пересборки) =="
fi

# 2. Electron wrapper dependencies
if [ ! -d "$DESKTOP_DIR/node_modules/electron-builder" ]; then
  echo "== устанавливаем зависимости desktop/ =="
  (cd "$DESKTOP_DIR" && npm install)
fi

# 3. Package the enabled parts into the common release directory.
#    The version directory is always fresh — rebuilding the same version
#    does not mix artifacts from a previous run.
rm -rf "$REL_DIR"
mkdir -p "$REL_DIR"

# Linux (on by default; flags --linux-portable/--linux-appimage)
if [ "$LINUX_PORTABLE" -eq 1 ] && [ "$LINUX_APPIMAGE" -eq 1 ]; then
  echo "== Linux: dir (portable-папка) + AppImage (единый файл) =="
  (cd "$DESKTOP_DIR" && npx electron-builder --linux dir AppImage --x64 -c.directories.output="$REL_DIR")
elif [ "$LINUX_PORTABLE" -eq 1 ]; then
  echo "== Linux: dir (portable-папка) =="
  (cd "$DESKTOP_DIR" && npx electron-builder --linux dir --x64 -c.directories.output="$REL_DIR")
else
  echo "== Linux: AppImage (единый файл) =="
  (cd "$DESKTOP_DIR" && npx electron-builder --linux AppImage --x64 -c.directories.output="$REL_DIR")
fi

# Windows (off by default; enabled via --win-portable/--win-exe/--win)
if [ "$WIN_PORTABLE" -eq 1 ]; then
  echo "== Windows: zip (portable-папка + архив) =="
  (cd "$DESKTOP_DIR" && npx electron-builder --win zip --x64 -c.directories.output="$REL_DIR")
fi

if [ "$WIN_EXE" -eq 1 ]; then
  echo "== Windows: единый self-contained .exe (portable, best-effort) =="
  if (cd "$DESKTOP_DIR" && npx electron-builder --win portable --x64 -c.directories.output="$REL_DIR"); then
    echo "   portable-.exe собран"
  else
    echo "   [warning] portable-.exe не собран: на этом хосте нет нужных"
    echo "   инструментов (wine/7z-sfx). Zip и папка win-unpacked уже готовы;" >&2
    echo "   соберите --win-exe (portable-.exe) на Windows-хосте или с wine." >&2
  fi
fi

# Remove electron-builder service files from the release directory:
# only distributable artifacts remain in release/<version>/.
rm -rf "$REL_DIR/.icon-ico" "$REL_DIR/builder-debug.yml" "$REL_DIR/builder-effective-config.yaml"

echo ""
echo "== Готово. Релиз v$VERSION в: $REL_DIR =="
if [ "$WIN_PORTABLE" -eq 1 ]; then
  echo "   Windows portable: $REL_DIR/win-unpacked/  (запуск: MVS ERP.exe)  + $REL_DIR/MVS ERP-$VERSION-win-x64.zip"
fi
if [ "$WIN_EXE" -eq 1 ]; then
  echo "   Windows единый:   $REL_DIR/MVS ERP-$VERSION-win-x64.exe   (если собран, см. warning выше)"
fi
if [ "$LINUX_PORTABLE" -eq 1 ]; then
  echo "   Linux portable:   $REL_DIR/linux-unpacked/  (запуск: ./MVS ERP)"
fi
if [ "$LINUX_APPIMAGE" -eq 1 ]; then
  echo "   Linux единый:     $REL_DIR/MVS ERP-$VERSION-linux-x86_64.AppImage"
fi