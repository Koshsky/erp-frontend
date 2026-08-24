#!/usr/bin/env bash
#
# Сборка релизных версий MVS ERP из Electron-обвязки (Windows + Linux).
#
#  Что делает:
#    1. Определяет версию приложения (см. «Версия» ниже).
#    2. Собирает веб-фронтенд (services/frontend/dist/) с той же версией
#       (если ещё не собран или передан флаг --build-web).
#    3. Проверяет/ставит зависимости Electron-обвязки (desktop/).
#    4. Запускает electron-builder для каждой ОС:
#         Windows:  zip (portable-папка+архив) + portable (единый .exe, best-effort)
#         Linux:    dir (portable-папка) + AppImage (единый файл)
#
#  Версия:
#    - источник — desktop/package.json (semver), её же получают артефакты и UI
#      (в dist через env APP_VERSION);
#    - по умолчанию на каждую сборку инкрементируется patch (1.0.0 -> 1.0.1);
#    - --version X.Y.Z — точная версия (без инкремента);
#    - --bump minor|major|patch — явный тип инкремента; --no-bump — без изменений.
#    Скрипт версию не коммитит: bump лучше зафиксировать отдельным коммитом
#    (например chore(desktop): release v1.0.1).
#
#  Использование:
#    ./build-portable.sh                     # обе ОС, версия = bump patch
#    ./build-portable.sh --win --linux       # то же явно
#    ./build-portable.sh --win               # только Windows
#    ./build-portable.sh --linux             # только Linux
#    ./build-portable.sh --version 2.1.0     # собрать именно 2.1.0
#    ./build-portable.sh --no-bump           # текущая версия как есть
#    ./build-portable.sh --bump minor        # инкремент minor
#    ./build-portable.sh --build-web         # принудительно пересобрать dist/
#    ./build-portable.sh --clean             # очистить release/ перед сборкой
#
#  Артефакты (release/):
#    Windows: MVS ERP-<v>-win-x64.zip (portable-архив) + win-unpacked/
#             MVS ERP-<v>-win-x64.exe (единый self-contained .exe; best-effort)
#    Linux:   MVS ERP-<v>-linux-x64.AppImage (единый файл) + linux-unpacked/
#
#  Примечание по wine: таргеты zip/dir/portable/AppImage не требуют wine на
#  Linux-хосте; единый Windows-.exe (portable) собирается отдельным вызовом и
#  при недоступных инструментах среды не ломает остальные артефакты. NSIS-
#  установщик (npm run dist:win) НЕ portable и требует wine/makensis или
#  Windows-хост — здесь намеренно не собирается.
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
BUMP_TYPE="patch"
BUMP=1
OVERRIDE_VERSION=""

for arg in "$@"; do
  case "$arg" in
    --win)        WIN=1 ;;
    --linux)      LINUX=1 ;;
    --build-web)  BUILD_WEB=1 ;;
    --clean)      CLEAN=1 ;;
    --no-bump)    BUMP=0 ;;
    --bump)       echo "--bump требует аргумент: patch|minor|major" >&2; exit 1 ;;
    --bump=*)     BUMP_TYPE="${arg#--bump=}"; BUMP=1 ;;
    --version)    echo "--version требует аргумент X.Y.Z" >&2; exit 1 ;;
    --version=*)  OVERRIDE_VERSION="${arg#--version=}"; BUMP=0 ;;
    -h|--help)
      sed -n '2,/^#$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Неизвестный аргумент: $arg" >&2
      echo "Используйте: $0 [--win] [--linux] [--build-web] [--clean] [--version X.Y.Z] [--bump patch|minor|major] [--no-bump]" >&2
      exit 1
      ;;
  esac
done

case "$BUMP_TYPE" in
  patch|minor|major) ;;
  *) echo "Некорректный --bump: $BUMP_TYPE (ожидается patch|minor|major)" >&2; exit 1 ;;
esac

# По умолчанию — обе платформы
if [ "$WIN" -eq 0 ] && [ "$LINUX" -eq 0 ]; then
  WIN=1
  LINUX=1
fi

# ---------- Версия ----------
# Источник — desktop/package.json. По умолчанию bump patch; --version снимает
# инкремент и задаёт точную; --no-bump просто оставляет текущую.
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

# Валидация semver-вида (npm уже проверяет при bump; контроль для --version)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Некорректная версия: $VERSION (ожидается X.Y.Z)" >&2
  exit 1
fi

# Версия уходит в веб-сборку: vite пропишет её в __APP_VERSION__ и
# precache-manifest.json — UI («Версия приложения/сборки») совпадёт с артефактами.
export APP_VERSION="$VERSION"

echo "== MVS ERP: сборка релиза v$VERSION =="
echo "   фронтенд: $FRONTEND_DIR"
echo "   вывод:    $OUT_DIR"

if [ "$CLEAN" -eq 1 ] && [ -d "$OUT_DIR" ]; then
  echo "== очистка $OUT_DIR =="
  rm -rf "$OUT_DIR"
fi

# 1. Веб-фронтенд
if [ "$BUILD_WEB" -eq 1 ] || [ ! -f "$FRONTEND_DIR/dist/index.html" ]; then
  echo "== собираем web-фронтенд (dist/, версия $APP_VERSION) =="
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

# 3. Упаковка
mkdir -p "$OUT_DIR"

if [ "$WIN" -eq 1 ]; then
  echo "== Windows: zip (portable-папка + архив) =="
  (cd "$DESKTOP_DIR" && npx electron-builder --win zip --x64)

  echo "== Windows: единый self-contained .exe (portable, best-effort) =="
  if (cd "$DESKTOP_DIR" && npx electron-builder --win portable --x64); then
    echo "   portable-.exe собран"
  else
    echo "   [warning] portable-.exe не собран: на этом хосте нет нужных"
    echo "   инструментов (wine/7z-sfx). Zip и папка win-unpacked уже готовы;" >&2
    echo "   соберите --win portable на Windows-хосте или с wine." >&2
  fi
fi

if [ "$LINUX" -eq 1 ]; then
  echo "== Linux: AppImage (единый файл) + dir (portable-папка) =="
  (cd "$DESKTOP_DIR" && npx electron-builder --linux dir AppImage --x64)
fi

echo ""
echo "== Готово. Релиз v$VERSION в: $OUT_DIR =="
if [ "$WIN" -eq 1 ]; then
  echo "   Windows portable: $OUT_DIR/win-unpacked/  (запуск: MVS ERP.exe)  + $OUT_DIR/MVS ERP-$VERSION-win-x64.zip"
  echo "   Windows единый:   $OUT_DIR/MVS ERP-$VERSION-win-x64.exe   (если собран, см. warning выше)"
fi
if [ "$LINUX" -eq 1 ]; then
  echo "   Linux portable:   $OUT_DIR/linux-unpacked/  (запуск: ./MVS ERP)"
  echo "   Linux единый:     $OUT_DIR/MVS ERP-$VERSION-linux-x64.AppImage"
fi