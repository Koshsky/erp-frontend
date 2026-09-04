'use strict'

/**
 * Preload: bridge between the renderer and main via contextBridge.
 * The renderer receives a minimal, strictly typed API:
 *   window.erpDesktop.isElectron  → true
 *   window.erpDesktop.appVersion  → { version, electron }
 *   window.erpDesktop.password.*  → get/set/clear (safeStorage in main)
 *
 * The renderer has no access to Node/filesystem (nodeIntegration off,
 * contextIsolation on, sandbox on).
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('erpDesktop', {
  isElectron: true,
  appVersion: () => ipcRenderer.invoke('erp:app-version'),
  password: {
    get: () => ipcRenderer.invoke('erp:password:get'),
    set: (value) => ipcRenderer.invoke('erp:password:set', value),
    clear: () => ipcRenderer.invoke('erp:password:clear'),
  },
})
