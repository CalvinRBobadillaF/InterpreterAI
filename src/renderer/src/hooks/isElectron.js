/**
 * utils/isElectron.js
 *
 * Detecta si la app corre dentro de Electron.
 *
 * La detección se basa en la presencia de window.electronAPI,
 * que el preload.js expone vía contextBridge. Es la forma más
 * robusta y compatible con contextIsolation: true.
 */

export const isElectron = () => {
  if (typeof window === 'undefined') return false
  const hasAPI = !!window.electronAPI?.getAudioSource
  // En dev, log útil — quítalo en prod si quieres
  if (import.meta.env.DEV) {
    console.log('[isElectron]', hasAPI ? 'Electron detectado' : 'Navegador web')
  }
  return hasAPI
}