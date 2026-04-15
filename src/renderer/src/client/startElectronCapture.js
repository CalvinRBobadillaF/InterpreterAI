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

export const startElectronCapture = async () => {
  // Verificamos que estamos en Electron y que el preload está cargado
  if (!window.electronAPI?.getAudioSource) {
    console.error('[Electron] electronAPI no encontrado. ¿Está cargado el preload.js?')
    return null
  }

  // Pedimos al proceso principal el id de la fuente de pantalla
  let fuente
  try {
    fuente = await window.electronAPI.getAudioSource()
  } catch (e) {
    console.error('[Electron] Error IPC:', e)
    return null
  }

  if (!fuente) {
    console.error('[Electron] El proceso principal no devolvió ninguna fuente de audio')
    return null
  }

  try {
    // getUserMedia con chromeMediaSource funciona en el Chromium de Electron
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource:   'desktop',
          chromeMediaSourceId: fuente.id,
          // Desactivamos el procesamiento de audio — queremos el sonido crudo del sistema
          echoCancellation:  false,
          noiseSuppression:  false,
          autoGainControl:   false,
        },
      },
      // Requerimos video aunque no lo usemos — es necesario para desktop capture
      video: {
        mandatory: {
          chromeMediaSource:   'desktop',
          chromeMediaSourceId: fuente.id,
        },
      },
    })

    // Descartamos el video inmediatamente
    stream.getVideoTracks().forEach(t => t.stop())

    console.log('[Electron] Stream de audio del sistema listo')
    return stream

  } catch (e) {
    console.error('[Electron] getUserMedia falló:', e)
    return null
  }
}
