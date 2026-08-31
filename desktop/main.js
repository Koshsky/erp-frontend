'use strict'

/**
 * Electron main process for MVS ERP.
 *
 * The app serves the built vite frontend (services/frontend/dist) through a
 * local HTTP server on 127.0.0.1, not via file://. Reason: the frontend
 * hard-codes root paths (/precache-manifest.json, /assets/*),
 * designed for an http context.
 * The local http server keeps them working without changing the frontend.
 *
 * The API is external: the user sets the backend URL on the sync screen
 * (the frontend's runtime configuration). Only the autosync password is
 * stored here — via safeStorage (OS-level encryption), and access to it
 * is granted to the renderer through a limited IPC bridge in preload.js.
 */

const { app, BrowserWindow, ipcMain, safeStorage, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const { URL } = require('node:url')

// ---------------------------------------------------------------------------
// User data location — deterministic per-user folder on every platform.
// ---------------------------------------------------------------------------
// Pin the directory name explicitly so it never depends on productName and
// never falls back to a temporary location:
//   Linux   ~/.config/mvs-erp-desktop            (XDG_CONFIG_HOME-aware)
//   Windows %APPDATA%\mvs-erp-desktop
//   macOS   ~/Library/Application Support/mvs-erp-desktop
// The Linux path matches the existing profile (session, cache, offline queue,
// autosync password, singleton lock are NOT lost). Must be set before any
// app.getPath('userData') call (singleton lock below) and before app ready.
//
// A CLI --user-data-dir override is honored (not overwritten): testing /
// diagnostic launches use it on purpose and must keep working — otherwise the
// app would silently keep the old profile data and never show the login page.
const usesCliUserDataDir = process.argv.some(
  (arg) => arg === '--user-data-dir' || arg.startsWith('--user-data-dir='),
)
if (!usesCliUserDataDir) {
  app.setPath('userData', path.join(app.getPath('appData'), 'mvs-erp-desktop'))
}

const DEFAULT_PORT = 31880
/** How many consecutive ports to try after DEFAULT_PORT when it is busy */
const PORT_SEARCH_LIMIT = 20
/**
 * Path to the built frontend.
 *  - dev (electron .): desktop/../dist = services/frontend/dist
 *  - packaged: extraResources places dist into <resources>/web (outside app.asar)
 */
const WEB_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(__dirname, '..', 'dist')

// Single instance: two windows (and two local HTTP servers on the same port)
// must never run at once. A second launch focuses the existing window instead
// of ending up with a blank/broken second instance.
//
// requestSingleInstanceLock() returns false BOTH when another instance owns the
// lock AND when the lock cannot be created at all (read-only HOME, unusual
// environments). So we only quit when the lock file really exists — otherwise
// we run anyway (the dynamic port fallback below covers duplicate instances).
const gotTheLock = app.requestSingleInstanceLock()
const lockFile = path.join(app.getPath('userData'), 'SingletonLock')
if (!gotTheLock && fs.existsSync(lockFile)) {
  console.log('[desktop] приложение уже запущено — выходим (single instance)')
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })
}

// ---------------------------------------------------------------------------
// Local http server for the built frontend
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const IMMUTABLE_EXT = new Set(['.js', '.mjs', '.css', '.ttf', '.woff', '.woff2', '.svg', '.png'])

function normalizePath(urlPath) {
  // Normalize to the root and strip traversal, but keep "/" → index.html
  const decoded = decodeURIComponent(urlPath)
  const p = path.normalize('/' + decoded).replace(/^\/+/, '')
  const abs = path.join(WEB_DIR, p)
  if (!abs.startsWith(WEB_DIR + path.sep) && abs !== WEB_DIR) {
    return null
  }
  return abs
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1')
  let filePath = normalizePath(url.pathname)

  if (filePath == null) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('Forbidden')
    return
  }

  // Resolve the target file: if the path points to a directory (trailing '/' etc.)
  // or does not exist — serve the SPA index.html. readFileSync never
  // receives a directory (otherwise EISDIR).
  let resolved = filePath
  try {
    const st = fs.statSync(resolved)
    if (!st.isFile()) {
      resolved = path.join(WEB_DIR, 'index.html')
    }
  } catch {
    resolved = path.join(WEB_DIR, 'index.html')
  }

  let data
  try {
    data = fs.readFileSync(resolved)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
    return
  }

  const ext = path.extname(resolved).toLowerCase()
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
  }

  // Cache modeled after the frontend nginx config: hashed assets are immutable,
  // index.html/precache-manifest are not cached (always the fresh version).
  const base = path.basename(resolved)
  if (IMMUTABLE_EXT.has(ext) && resolved.startsWith(path.join(WEB_DIR, 'assets'))) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  } else if (base === 'index.html' || base === 'precache-manifest.json') {
    headers['Cache-Control'] = 'no-cache'
  }

  headers['Content-Length'] = data.length
  res.writeHead(200, headers)
  res.end(data)
}

/**
 * Starts the local HTTP server for the built frontend.
 *
 * The default port may already be taken (a leftover instance that crashed, or
 * another app). We then fall back to the next free ports (up to
 * PORT_SEARCH_LIMIT tries). If no port is free — reject; the caller shows an
 * error dialog instead of silently leaving the user with a blank window.
 */
async function startHttpServer() {
  for (let port = DEFAULT_PORT; port < DEFAULT_PORT + PORT_SEARCH_LIMIT; port++) {
    try {
      return await listenOnce(port)
    } catch (err) {
      // Only a busy port is retried; anything else (permissions, etc.) is fatal.
      if (err.code !== 'EADDRINUSE') throw err
      console.log(`[desktop] порт ${port} занят — пробуем следующий`)
    }
  }
  throw new Error(`Не удалось найти свободный порт в диапазоне ${DEFAULT_PORT}–${DEFAULT_PORT + PORT_SEARCH_LIMIT - 1}`)
}

function listenOnce(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(serveStatic)
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const { port: boundPort } = server.address()
      console.log(`[desktop] локальный http-сервер фронтенда: http://127.0.0.1:${boundPort}`)
      resolve(server)
    })
  })
}

// ---------------------------------------------------------------------------
// safeStorage: autosync password storage (accessible only through IPC)
// ---------------------------------------------------------------------------

const PASSWORD_KEY = 'mvs_erp_sync_password'

function encryptString(value) {
  if (!value) return null
  const buf = Buffer.from(value, 'utf8')
  return safeStorage.encryptString(value).toString('base64')
}

function decryptString(b64) {
  if (!b64) return ''
  try {
    return safeStorage.decryptString(Buffer.from(b64, 'base64'))
  } catch {
    return ''
  }
}

function loadPassword() {
  try {
    const raw = fs.readFileSync(path.join(app.getPath('userData'), PASSWORD_KEY), 'utf8')
    return decryptString(raw.trim())
  } catch {
    return ''
  }
}

function savePassword(password) {
  const file = path.join(app.getPath('userData'), PASSWORD_KEY)
  if (!password) {
    try {
      fs.unlinkSync(file)
    } catch {
      // file missing — ok
    }
    return
  }
  fs.writeFileSync(file, encryptString(password), { mode: 0o600 })
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(baseUrl) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.loadURL(baseUrl)
  return win
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let server = null

/**
 * Allow self-signed TLS certificates of the backend (nginx generates
 * server.crt via generate-certs.sh). Chromium rejects self-signed
 * by default, so without this https://localhost (and other internal servers)
 * would not work. We accept ONLY self-signed certificates (issuer ==
 * subject); validation for the rest (untrusted chain, wrong domain,
 * expired) is preserved.
 */
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  const isSelfSigned =
    certificate.issuerName === certificate.subjectName &&
    /CN=/.test(certificate.subjectName)
  if (isSelfSigned && /^https:\/\//.test(url)) {
    console.log('[desktop] принят самоподписанный сертификат:', url)
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})

app.whenReady().then(async () => {
  // Without the single-instance lock the app already quit itself (see above).
  if (!gotTheLock) return

  // setCertificateVerifyProc intercepts ALL TLS session verifications, including
  // fetch/axios from the renderer (for them certificate-error does not always fire).
  // Codes — Chromium net::Error:
  //   0    — certificate is valid;
  //  -202  — ERR_CERT_AUTHORITY_INVALID (self-signed / untrusted CA);
  //  -207  — ERR_CERT_INVALID (invalid, but often self-signed).
  // Others (expired -201, wrong domain -200) are rejected as usual.
  const { session } = require('electron')
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    if (request.errorCode !== 0 && request.errorCode !== -202 && request.errorCode !== -207) {
      console.log('[desktop] сертификат отклонён:', request.hostname, 'code=', request.errorCode)
    }
    if (request.errorCode === 0 || request.errorCode === -202 || request.errorCode === -207) {
      callback(0)
    } else {
      callback(-3)
    }
  })

  try {
    server = await startHttpServer()
  } catch (err) {
    // No free port at all (or a fatal bind error): tell the user instead of
    // silently showing nothing / a blank window.
    console.error('[desktop] не удалось запустить локальный http-сервер:', err)
    dialog.showErrorBox(
      'MVS ERP — ошибка запуска',
      `Не удалось запустить локальный сервер приложения: ${err && err.message ? err.message : err}`,
    )
    app.quit()
    return
  }
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`

  ipcMain.handle('erp:password:get', () => {
    if (!safeStorage.isEncryptionAvailable()) return null
    return loadPassword()
  })
  ipcMain.handle('erp:password:set', (_e, value) => {
    if (!safeStorage.isEncryptionAvailable()) return false
    savePassword(typeof value === 'string' && value.length > 0 ? value : '')
    return true
  })
  ipcMain.handle('erp:password:clear', () => {
    savePassword('')
    return true
  })
  ipcMain.handle('erp:app-version', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
  }))

  createWindow(baseUrl)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(baseUrl)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  if (server) server.close()
  if (safeStorage.isEncryptionAvailable()) {
    // keep the encrypted file as is — nothing extra is needed
  }
})
