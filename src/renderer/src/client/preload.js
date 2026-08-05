/**
 * preload.js
 *
 * Puente seguro entre el proceso principal (main) y el renderer (React).
 * contextIsolation: true + contextBridge — sin exponer Node ni ipcRenderer directamente.
 *
 * APIs expuestas en window.electronAPI:
 *   - getAudioSource()   → fuente de pantalla para captura de sistema
 *   - getAllSources()     → todas las fuentes disponibles (pantallas + ventanas)
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Devuelve la primera fuente de pantalla para captura de audio del sistema.
   * @returns {Promise<{id: string, name: string}|null>}
   */
  getAudioSource: () => ipcRenderer.invoke('get-audio-source'),

  /**
   * Devuelve todas las fuentes disponibles (pantallas + ventanas).
   * Útil si quieres mostrar un selector al usuario.
   * @returns {Promise<Array<{id: string, name: string, thumbnail: NativeImage}>>}
   */
  getAllSources: () => ipcRenderer.invoke('get-all-sources'),
})
