'use strict'

/**
 * Preload: мост между renderer и main через contextBridge.
 * Renderer получает минимальный, строго типизированный API:
 *   window.erpDesktop.isElectron  → true
 *   window.erpDesktop.appVersion  → { version, electron }
 *   window.erpDesktop.password.*  → get/set/clear (safeStorage в main)
 *
 * Никакого доступа к Node/filesystem у renderer нет (nodeIntegration off,
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
