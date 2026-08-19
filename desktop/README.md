# MVS ERP — настольная обвязка (Electron)

Оборачивает собранный vite-фронтенд (`dist/`) в нативное десктоп-приложение
(Windows / macOS / Linux). Приложение остаётся **той же PWA**: работает онлайн
и офлайн (IndexedDB + локальный http), подключается к внешнему бэкенду по
API_URL (задаётся на экране «Синхронизация»).

## Как это работает

- `main.js` (main-процесс) поднимает локальный HTTP-сервер на `127.0.0.1`,
  отдающий `../dist` (собранный фронтенд). Это нужно, потому что фронтенд
  жёстко использует корневые пути `/precache-manifest.json`, `/assets/*`,
  `/manifest.webmanifest` — через `http` они работают без правок кода
  (в отличие от `file://`).
- `preload.js` через `contextBridge` отдаёт renderer'у минимальный API
  `window.erpDesktop` (флаг `isElectron` + доступ к safeStorage для пароля).
- Service Worker в Electron **отключён** (см. `src/main.ts` фронтенда): офлайн
  даёт локальный http + IndexedDB, а SW только конфликтовал бы между сборками.

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

Запуск в dev (без упаковки):

```bash
npm start          # открывает Electron-окно с локально поданным dist/
```

## Пароль автосинка

Пароль для автосинхронизации хранится **не в браузере**, а в main-процессе
через `safeStorage` (шифрование на уровне ОС, файл в `userData`), и доступен
renderer'у только через IPC (`window.erpDesktop.password.get/set/clear`).
В обычном браузере (не Electron) пароль не хранится вовсе.

На экране «Синхронизация» (только в настольной версии) есть блок «Данные
для автосинка»: логин сохраняется в localStorage, пароль — в safeStorage.
При запуске приложение автоматически восстанавливает сессию по сохранённым
креденшелам (`ensureDesktopAutoSyncSession` в `src/offline/sync.ts`), если
автосинк включён и сессия отсутствует, — и выполняет синхронизацию без
ручного входа.

## Требования

- Node.js ≥ 20 (для сборки/упаковки).
- Для сборки macOS-установщика нужен macOS; Windows .exe удобнее собирать
  на Windows (electron-builder умеет и кросс-сборку с ограничениями).
- safeStorage работает там, где ОС даёт шифрование (macOS Keychain, Windows
  DPAPI, Linux — keyring); если ключа нет, пароль просто не сохраняется.
