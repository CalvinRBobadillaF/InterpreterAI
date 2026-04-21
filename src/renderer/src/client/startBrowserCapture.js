/**
 * client/startBrowserCapture.js
 *
 * Captura audio de una pestaña del navegador usando getDisplayMedia.
 *
 * LIMITACIÓN EN MAC:
 * macOS no permite capturar el audio del sistema vía getDisplayMedia.
 * Solo funciona si el usuario comparte una pestaña específica de Chrome
 * (no ventana ni pantalla completa) y marca "Compartir audio de la pestaña".
 * Para audio del sistema en Mac, usar el modo "Electron" (desktopCapturer).
 *
 * RETORNA: { stream, reason, userMessage }
 * - stream: MediaStream con audio, o null si falló
 * - reason: código del error ('cancelled', 'no-audio-track', 'mac-no-audio')
 * - userMessage: mensaje legible para mostrar al usuario
 */

const ES_MAC = navigator.platform?.toUpperCase().includes('MAC') ||
               navigator.userAgent?.includes('Mac')

export const startBrowserCapture = async () => {
  if (ES_MAC) {
    console.info(
      '[Captura] Estás en macOS.\n' +
      'Para audio de pestaña: en el diálogo, elige una pestaña de Chrome específica\n' +
      '(no "Pantalla" ni "Ventana"), y marca la casilla "Compartir audio de la pestaña".\n' +
      'Para audio del sistema, usa la fuente "System Audio" en el encabezado.'
    )
  }

  let stream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        // ✅ APAGADOS: Evita doble procesamiento (voz robótica) en audio de pestaña
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl:  false,
        
        // ✅ OPTIMIZADO PARA DEEPGRAM: Mono (1 canal), 16kHz (frecuencia nativa de voz)
        ...(ES_MAC ? {} : { 
          channelCount: 1, 
          sampleRate: 16000, 
          sampleSize: 16 
        }),
      },
      video: {
        // Pedimos la resolución mínima — descartamos el video de todas formas
        width: { ideal: 1 }, height: { ideal: 1 }, frameRate: { ideal: 1 },
      },
    })
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      return { stream: null, reason: 'cancelled' }
    }
    console.error('[Captura] getDisplayMedia falló:', e)
    return { stream: null, reason: e.message }
  }

  // Descartamos las pistas de video — solo necesitamos audio
  stream.getVideoTracks().forEach(t => t.stop())

  if (stream.getAudioTracks().length === 0) {
    return {
      stream: null,
      reason: ES_MAC ? 'mac-no-audio' : 'no-audio-track',
      userMessage: ES_MAC
        ? 'Sin audio. En Mac, elige una pestaña de Chrome y marca "Compartir audio de la pestaña".'
        : 'Sin audio. Asegúrate de marcar "Compartir audio de la pestaña" en el diálogo.',
    }
  }

  console.log('[Captura] Stream de audio listo:', stream.getAudioTracks()[0].label)
  return { stream, reason: null }
}