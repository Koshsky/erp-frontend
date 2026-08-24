# MVS ERP — настольная обвязка (Electron)

Оборачивает собранный vite-фронтенд (`dist/`) в нативное десктоп-приложение
(Windows / macOS / Linux). Приложение работает онлайн и офлайн (IndexedDB +
локальный http), подключается к внешнему бэкенду по API_URL (задаётся на
экране «Синхронизация» или в настройках до входа).

## Как это работает

- `main.js` (main-процесс) поднимает локальный HTTP-сервер на `127.0.0.1`,
  отдающий `../dist` (собранный фронтенд). Это нужно, потому что фронтенд
  жёстко использует корневые пути `/precache-manifest.json`, `/assets/*` —
  через `http` они работают без правок кода (в отличие от `file://`).
- `preload.js` через `contextBridge` отдаёт renderer'у минимальный API
  `window.erpDesktop` (флаг `isElectron` + доступ к safeStorage для пароля).
- Service Worker отсутствует (в проекте вырезан): офлайн в приложении даёт
  локальный http + IndexedDB (кэш данных и очередь изменений).

## Сборка

Предварительно собрать фронтенд:

```bash
cd ../            # services/frontend
npm run build     # → dist/
```

Затем собрать установщики (из `desktop/`):

```bash
npm install        # electron + electron-builder (уже в devDependencies)
npm run dist       # все платформы
npm run dist:win   # только Windows (NSIS .exe)
npm run dist:mac   # macOS (dmg + zip)
npm run dist:linux # Linux (AppImage + deb)
```

Готовые файлы — в `release/`.

### Portable + единый файл — Windows и Linux

Скрипт `build-portable.sh` собирает релиз с **версией** и артефактами:

- Windows: `win-unpacked/` + `*-win-x64.zip` (portable) **и** единый
  self-contained `*-win-x64.exe` (таргет `portable`, best-effort);
- Linux: `linux-unpacked/` (portable) **и** единый файл `*-linux-x64.AppImage`.

**Версия** берётся из `desktop/package.json` (semver) и по умолчанию
**инкрементируется** на каждой сборке (patch):

```bash
./build-portable.sh                 # обе ОС, версия = bump patch
./build-portable.sh --win --linux   # то же явно
./build-portable.sh --version 2.1.0 # собрать именно 2.1.0
./build-portable.sh --bump minor    # инкремент minor
./build-portable.sh --no-bump       # текущая версия без изменений
./build-portable.sh --build-web     # принудительно пересобрать dist/
./build-portable.sh --clean         # очистить release/ перед сборкой
```

Версия прокидывается в веб-сборку (`APP_VERSION` → `__APP_VERSION__` и
`precache-manifest.json`), поэтому «Версия приложения/сборки» на экране
«Синхронизация» совпадает с версией артефактов. Скрипт версию не коммитит —
инкремент фиксируйте отдельным коммитом (`chore(desktop): release vX.Y.Z`).

Portable-таргеты не требуют wine: `zip`/`dir`/portable/AppImage собираются на
Linux-хосте. Единый Windows-`.exe` (таргет `portable`) собирается отдельным
вызовом; если среда не даёт его собрать, скрипт продолжает с zip и печатает
предупреждение. (NSIS-`.exe`-установщик — НЕ portable, ему на Linux нужны wine
+ makensis; это отдельный `npm run dist:win`.)

Запуск в dev (без упаковки):

```bash
npm start          # открывает Electron-окно с локально поданным dist/
```

## Пароль автосинка

Пароль для автосинхронизации хранится **не в браузере**, а в main-процессе
через `safeStorage` (шифрование на уровне ОС, файл в `userData`), и доступен
renderer'у только через IPC (`window.erpDesktop.password.get/set/clear`).
В обычном браузере (не Electron) пароль не хранится вовсе.

Креды автосинка **сохраняются автоматически при входе** (на странице логина):
логин — в localStorage, пароль — в safeStorage; отдельного ввода на экране
«Синхронизация» нет. При запуске приложение автоматически восстанавливает
сессию по сохранённым креденшелам (`ensureDesktopAutoSyncSession` в
`src/offline/sync.ts`), если автосинк включён и сессия отсутствует, — и
выполняет синхронизацию без ручного входа. После явного «Выйти» автосинк не
входит до следующего ручного входа. Без сети страница логина предлагает
«Войти офлайн» — локальную сессию с кэшем и очередью изменений.

## Требования

- Node.js ≥ 20 (для сборки/упаковки).
- Для сборки macOS-установщика нужен macOS; Windows .exe удобнее собирать
  на Windows (electron-builder умеет и кросс-сборку с ограничениями).
- safeStorage работает там, где ОС даёт шифрование (macOS Keychain, Windows
  DPAPI, Linux — keyring); если ключа нет, пароль просто не сохраняется.
