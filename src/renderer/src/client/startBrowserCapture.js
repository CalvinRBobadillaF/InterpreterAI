// client/startBrowserCapture.js
/**
 * client/startBrowserCapture.js
 *
 * Captura audio de una pestaña del navegador usando getDisplayMedia.
 *
 * FIXES aplicados:
 * - Detección de Mac más robusta (incluye M1/M2 con userAgentData)
 * - Stop de tracks de video ANTES de verificar audio (evita leak)
 * - Timeout de 30s para el diálogo del navegador (evita promesa colgada)
 * - Mensaje de error diferenciado por tipo de fallo
 * - Track 'ended' listener para detectar cuando el usuario detiene la captura
 */

// ── Detección de macOS más robusta ────────────────────────────────────────
const ES_MAC = (() => {
  // API moderna (Chrome 90+)
  if (navigator.userAgentData?.platform) {
    return navigator.userAgentData.platform.toLowerCase().includes('mac')
  }
  // Fallback legacy
  return (
    navigator.platform?.toUpperCase().includes('MAC') ||
    /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
  )
})()

/**
 * Inicia la captura de audio del navegador.
 *
 * @param {object}   options
 * @param {Function} options.onTrackEnded  Callback cuando el usuario detiene
 *                                         la captura desde el navegador
 * @returns {Promise<{stream: MediaStream|null, reason: string|null, userMessage: string|null}>}
 */
export const startBrowserCapture = async ({ onTrackEnded } = {}) => {
  if (ES_MAC) {
    console.info(
      '[Captura] macOS detectado.\n' +
      '→ Para audio de pestaña: en el diálogo, elige una PESTAÑA de Chrome\n' +
      '  (no "Pantalla" ni "Ventana") y marca "Compartir audio de la pestaña".\n' +
      '→ Para audio del sistema: usa BlackHole o Loopback como fuente de audio.'
    )
  }

  // ── Timeout para el diálogo del navegador ────────────────────────────
  // Si el usuario tarda más de 60s en responder al diálogo, cancelamos
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('DIALOG_TIMEOUT')),
      60_000
    )
  })

  let stream
  try {
    stream = await Promise.race([
      navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,
          // En Mac omitimos restricciones de sample rate porque
          // el sistema las ignora y puede causar errores de constraints
          ...(ES_MAC ? {} : {
            channelCount: 1,
            sampleRate:   16000,
            sampleSize:   16,
          }),
        },
        video: {
          // Mínima resolución posible — lo descartamos inmediatamente
          width:     { ideal: 1 },
          height:    { ideal: 1 },
          frameRate: { ideal: 1 },
        },
      }),
      timeoutPromise,
    ])
  } catch (e) {
    clearTimeout(timeoutId)

    if (e.message === 'DIALOG_TIMEOUT') {
      return {
        stream:      null,
        reason:      'timeout',
        userMessage: 'El diálogo tardó demasiado. Inténtalo de nuevo.',
      }
    }
    if (e.name === 'NotAllowedError') {
      return {
        stream:      null,
        reason:      'cancelled',
        userMessage: null, // Cancelación voluntaria → no mostrar error
      }
    }
    if (e.name === 'NotFoundError') {
      return {
        stream:      null,
        reason:      'not-found',
        userMessage: 'No se encontró ninguna fuente de audio disponible.',
      }
    }
    if (e.name === 'NotSupportedError') {
      return {
        stream:      null,
        reason:      'not-supported',
        userMessage: 'Tu navegador no soporta captura de pantalla. Usa Chrome o Edge.',
      }
    }

    console.error('[Captura] getDisplayMedia falló:', e.name, e.message)
    return {
      stream:      null,
      reason:      e.message,
      userMessage: `Error al iniciar captura: ${e.message}`,
    }
  } finally {
    clearTimeout(timeoutId)
  }

  // ── Limpiar pistas de video INMEDIATAMENTE ────────────────────────────
  // Importante: parar ANTES de inspeccionar las pistas de audio
  // para liberar el indicador de grabación de pantalla lo antes posible
  stream.getVideoTracks().forEach((t) => {
    t.stop()
    stream.removeTrack(t)
  })

  // ── Verificar que tenemos audio ───────────────────────────────────────
  const audioTracks = stream.getAudioTracks()
  if (audioTracks.length === 0) {
    return {
      stream:      null,
      reason:      ES_MAC ? 'mac-no-audio' : 'no-audio-track',
      userMessage: ES_MAC
        ? 'Sin audio. En Mac:\n' +
          '1. Elige una pestaña de Chrome (no Pantalla ni Ventana)\n' +
          '2. Marca la casilla "Compartir audio de la pestaña"'
        : 'Sin audio. En el diálogo, asegúrate de marcar "Compartir audio del sistema".',
    }
  }

  // ── Registrar listener para cuando el usuario detiene la captura ──────
  // Esto ocurre cuando el usuario hace clic en "Dejar de compartir" del navegador
  if (typeof onTrackEnded === 'function') {
    audioTracks.forEach((track) => {
      track.addEventListener('ended', onTrackEnded, { once: true })
    })
  }

  console.log(
    '[Captura] Stream de audio listo:',
    audioTracks[0].label,
    '| Canales:',
    audioTracks[0].getSettings().channelCount ?? '?',
    '| SampleRate:',
    audioTracks[0].getSettings().sampleRate    ?? '?',
  )

  return { stream, reason: null, userMessage: null }
}