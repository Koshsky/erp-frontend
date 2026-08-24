#!/usr/bin/env bash
#
# Сборка релизных версий MVS ERP из Electron-обвязки (Windows + Linux).
#
#  Что делает:
#    1. Определяет версию приложения (см. «Версия» ниже).
#    2. Собирает веб-фронтенд (services/frontend/dist/) с той же версией
#       (если ещё не собран или передан флаг --build-web).
#    3. Проверяет/ставит зависимости Electron-обвязки (desktop/).
#    4. Запускает electron-builder для включённых частей релиза (флаги ниже).
#       Все артефакты одного релиза складываются в ОДНУ директорию,
#       именованную конкретной версией: release/<версия>/.
#
#  Части релиза и флаги (Linux по умолчанию ВКЛЮЧЕН, Windows — ВЫКЛЮЧЕН;
#  явные флаги добавляют части к Linux-дефолту):
#    --linux-portable   Linux portable-папка linux-unpacked/          (default on)
#    --linux-appimage   Linux единый файл *.AppImage                  (default on)
#    --win-portable     Windows portable: win-unpacked/ + *.zip       (default off)
#    --win-exe          Windows единый self-contained *.exe           (default off)
#    --win              сокращение для --win-portable --win-exe
#    --linux            явное включение обоих Linux-флагов (no-op, и так дефолт)
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
#    ./build-portable.sh                     # Linux (обе части); версия = bump patch
#    ./build-portable.sh --win-portable      # Linux + Windows portable (zip+папка)
#    ./build-portable.sh --win-exe           # Linux + единый Windows .exe (best-effort)
#    ./build-portable.sh --win               # Linux + обе Windows-части
#    ./build-portable.sh --version 2.1.0     # собрать именно 2.1.0
#    ./build-portable.sh --no-bump           # текущая версия как есть
#    ./build-portable.sh --bump minor        # инкремент minor
#    ./build-portable.sh --build-web         # принудительно пересобрать dist/
#    ./build-portable.sh --clean             # очистить release/ перед сборкой
#
#  Артефакты (release/<версия>/ — все файлы одного релиза в одной директории):
#    Windows: MVS ERP-<v>-win-x64.zip (portable-архив) + win-unpacked/
#             MVS ERP-<v>-win-x64.exe (единый self-contained .exe; best-effort)
#    Linux:   MVS ERP-<v>-linux-x86_64.AppImage (единый файл) + linux-unpacked/
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

# Части релиза: Linux по умолчанию включён, Windows выключен
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

# Директория конкретного релиза: все артефакты этой версии — в одном месте
REL_DIR="$OUT_DIR/$VERSION"

echo "== MVS ERP: сборка релиза v$VERSION =="
echo "   фронтенд: $FRONTEND_DIR"
echo "   вывод:    $REL_DIR"

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

# 3. Упаковка включённых частей в общую директорию релиза.
#    Директория версии всегда свежая — повторная сборка той же версии
#    не смешивает артефакты от предыдущего запуска.
rm -rf "$REL_DIR"
mkdir -p "$REL_DIR"

# Linux (по умолчанию включён; флаги --linux-portable/--linux-appimage)
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

# Windows (по умолчанию выключен; включают --win-portable/--win-exe/--win)
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

# Убираем служебные файлы electron-builder из директории релиза:
# в release/<версия>/ остаются только распределяемые артефакты.
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
