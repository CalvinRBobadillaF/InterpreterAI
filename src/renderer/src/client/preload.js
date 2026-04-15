/**
 * preload.js
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  // Aquí es donde conectas el nombre que usa el Hook con el nombre del Main
  translate: (opts) => ipcRenderer.invoke('deepl-translate', opts),
  getAudioSource: () => ipcRenderer.invoke('get-audio-source'),
})