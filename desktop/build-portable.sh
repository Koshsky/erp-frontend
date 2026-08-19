#!/usr/bin/env bash
#
# Сборка PORTABLE-версий MVS ERP из Electron-обвязки (Windows + Linux).
#
#  Что делает:
#    1. Собирает веб-фронтенд (services/frontend/dist/), если ещё не собран
#       или передан флаг --build-web.
#    2. Проверяет/ставит зависимости Electron-обвязки (desktop/).
#    3. Запускает electron-builder:
#         * Windows portable:  --win zip  ->  release/win-unpacked/ + release/*-win.zip
#         * Linux   portable:  --linux dir ->  release/linux-unpacked/
#       ZIP/распакованная папка не требуют установки — это и есть portable.
#
#  Использование:
#    ./build-portable.sh                 # и Windows, и Linux
#    ./build-portable.sh --win           # только Windows portable
#    ./build-portable.sh --linux         # только Linux portable
#    ./build-portable.sh --build-web     # принудительно пересобрать dist/ перед упаковкой
#    ./build-portable.sh --clean         # очистить release/ перед сборкой
#
#  Возможные варианты "portable для Linux":
#    --linux dir    -> папка release/linux-unpacked/ (переносная, без установки)
#    (AppImage тоже переносимый одиночный файл: npm run dist:linux)
#
#  Примечание по Windows .exe-установщику (NSIS): НЕ portable. Требует wine +
#  makensis на Linux. Здесь намеренно НЕ собираем — portable это zip/папка.
#
set -euo pipefail

# Каталог скрипта (desktop/) и корень фронтенда
DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$DESKTOP_DIR/.." && pwd)"
OUT_DIR="$DESKTOP_DIR/release"

# Кэш electron/electron-builder. По умолчанию они кладут бинари в ~/.cache,
# который во многих окружениях (песочница/CI) read-only. Перенаправляем в
# рабочее дерево (этот каталог gitignored). @electron/get на Linux читает
# XDG_CACHE_HOME (envPaths) — именно его и задаём, плюс запасные переменные.
export XDG_CACHE_HOME="$DESKTOP_DIR/.cache"
export ELECTRON_CACHE="$XDG_CACHE_HOME/electron"
export electron_config_cache="$XDG_CACHE_HOME/electron"
export ELECTRON_BUILDER_CACHE="$XDG_CACHE_HOME/electron-builder"
mkdir -p "$XDG_CACHE_HOME" "$ELECTRON_BUILDER_CACHE"

WIN=0
LINUX=0
BUILD_WEB=0
CLEAN=0

for arg in "$@"; do
  case "$arg" in
    --win)       WIN=1 ;;
    --linux)     LINUX=1 ;;
    --build-web) BUILD_WEB=1 ;;
    --clean)     CLEAN=1 ;;
    -h|--help)
      sed -n '2,/^#$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Неизвестный аргумент: $arg" >&2
      echo "Используйте: $0 [--win] [--linux] [--build-web] [--clean]" >&2
      exit 1
      ;;
  esac
done

# По умолчанию — обе платформы
if [ "$WIN" -eq 0 ] && [ "$LINUX" -eq 0 ]; then
  WIN=1
  LINUX=1
fi

echo "== MVS ERP: сборка portable-версий =="
echo "   фронтенд: $FRONTEND_DIR"
echo "   вывод:    $OUT_DIR"

if [ "$CLEAN" -eq 1 ] && [ -d "$OUT_DIR" ]; then
  echo "== очистка $OUT_DIR =="
  rm -rf "$OUT_DIR"
fi

# 1. Веб-фронтенд
if [ "$BUILD_WEB" -eq 1 ] || [ ! -f "$FRONTEND_DIR/dist/index.html" ]; then
  echo "== собираем web-фронтенд (dist/) =="
  (cd "$FRONTEND_DIR" && test -d node_modules || npm install)
  (cd "$FRONTEND_DIR" && npm run build)
else
  echo "== dist/ уже собран (пропуск; --build-web для пересборки) =="
fi

# 2. Зависимости Electron-обвязки
if [ ! -d "$DESKTOP_DIR/node_modules/electron-builder" ]; then
  echo "== устанавливаем зависимости desktop/ =="
  (cd "$DESKTOP_DIR" && npm install)
fi

# 3. Упаковка portable
mkdir -p "$OUT_DIR"

if [ "$WIN" -eq 1 ]; then
  echo "== Windows portable (win-unpacked + zip) =="
  (cd "$DESKTOP_DIR" && npx electron-builder --win zip)
fi

if [ "$LINUX" -eq 1 ]; then
  echo "== Linux portable (linux-unpacked) =="
  (cd "$DESKTOP_DIR" && npx electron-builder --linux dir)
fi

echo ""
echo "== Готово. Portable-версии в: $OUT_DIR =="
if [ "$WIN" -eq 1 ]; then
  echo "   - Windows: $OUT_DIR/win-unpacked/  (запуск: MVS ERP.exe)  + $OUT_DIR/*-win.zip"
fi
if [ "$LINUX" -eq 1 ]; then
  echo "   - Linux:   $OUT_DIR/linux-unpacked/ (запуск: ./mvs-erp-desktop или ./MVS ERP)"
fi
