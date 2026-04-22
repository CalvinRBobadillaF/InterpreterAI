/**
 * client/startElectronCapture.js
 *
 * Captura el audio del sistema (computadora) usando Electron's desktopCapturer.
 *
 * FLUJO:
 *   1. El renderer le pide al main process el source id via IPC
 *      (desktopCapturer solo funciona en el proceso principal desde Electron 13+)
 *   2. Con ese id, llamamos getUserMedia con chromeMediaSource: 'desktop'
 *   3. Descartamos las pistas de video — solo necesitamos audio
 *
 * REQUISITO: preload.js debe exponer window.electronAPI.getAudioSource()
 */

// startElectronCapture.js — versión mejorada
export const startElectronCapture = async () => {
  if (!window.electronAPI?.getAudioSource) {
    console.error('[Electron] electronAPI no encontrado')
    return null
  }

  let fuente
  try {
    fuente = await window.electronAPI.getAudioSource()
  } catch (e) {
    console.error('[Electron] Error IPC:', e)
    return null
  }

  if (!fuente) {
    console.error('[Electron] Sin fuente disponible')
    return null
  }

  console.log('[Electron] Usando fuente:', fuente.name, fuente.id)

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: fuente.id,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: fuente.id,
          maxWidth: 1,   // mínimo posible — igual se descarta
          maxHeight: 1,
        },
      },
    })

    // Verificar que realmente hay audio
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      console.error('[Electron] Stream sin pistas de audio — posiblemente Linux o permisos')
      return null
    }

    console.log('[Electron] Pistas de audio:', audioTracks.map(t => t.label))

    // Descartar video
    stream.getVideoTracks().forEach(t => t.stop())

    return stream

  } catch (e) {
    console.error('[Electron] getUserMedia falló:', e.name, e.message)
    return null
  }
}