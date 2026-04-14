/**
 * preload.js
 * ─────────────────────────────────────────────────────────────────
 * Runs with Node.js access. Exposes a safe API to the renderer via
 * contextBridge. This file must be referenced in main.js:
 *   preload: path.join(__dirname, 'preload.js')
 * ─────────────────────────────────────────────────────────────────
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getAudioSource: () => ipcRenderer.invoke('get-audio-source'),
  getAllSources: () => ipcRenderer.invoke('get-all-sources'),

  isElectron: true,
})