/**
 * client/startElectronCapture.js  v3
 *
 * FIXES respecto a v2:
 * ─────────────────────────────────────────────────────────────────────
 * 1. CONSTRAINTS DE VIDEO FUERA DEL OBJETO mandatory:
 *    En Chromium ≥ 110 las constraints de video con mandatory + chromeMediaSource
 *    ignoran maxWidth/maxHeight si están dentro del objeto mandatory sin
 *    un wrapper correcto. Se mueven a nivel superior del objeto video para
 *    garantizar compatibilidad.
 *
 * 2. SAMPLERATE HINT al constraints de audio:
 *    Se agrega sampleRate: 16000 como hint (no mandatory) para orientar
 *    al driver sin forzarlo — algunos drivers rechazan mandatory sampleRate.
 *
 * 3. AUDIO-ONLY STREAM fallback:
 *    Si getUserMedia con video falla por OverconstrainedError de video
 *    (raro pero ocurre en algunas configuraciones Linux), reintenta
 *    sin el track de video usando una fuente de audio pura de escritorio.
 *
 * Mantenidos de v2: IPC timeout, diferenciación de errores, log de settings.
 */

const IPC_TIMEOUT_MS = 5_000

/**
 * @returns {Promise<{ stream: MediaStream|null, userMessage: string|null }>}
 */
export const startElectronCapture = async () => {
  // ── 1. Verificar que electronAPI está disponible ──────────────────────
  if (!window.electronAPI?.getAudioSource) {
    console.error(
      '[ElectronCapture] window.electronAPI.getAudioSource no encontrado.\n' +
      '→ Asegúrate de que preload.js expone electronAPI con contextBridge.'
    )
    return { stream: null, userMessage: 'Error interno: API de Electron no disponible.' }
  }

  // ── 2. Pedir fuente de audio al proceso principal ─────────────────────
  let fuente
  try {
    const ipcPromise = window.electronAPI.getAudioSource()
    const timeout    = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('IPC_TIMEOUT')), IPC_TIMEOUT_MS)
    )
    fuente = await Promise.race([ipcPromise, timeout])
  } catch (e) {
    const msg = e.message === 'IPC_TIMEOUT'
      ? 'El proceso principal tardó demasiado. Reinicia la app.'
      : `Error IPC: ${e.message}`
    console.error('[ElectronCapture]', msg)
    return { stream: null, userMessage: msg }
  }

  if (!fuente?.id) {
    console.error('[ElectronCapture] No se encontró ninguna fuente de escritorio.')
    return { stream: null, userMessage: 'No se encontró fuente de audio del sistema.' }
  }

  console.log(`[ElectronCapture] Usando fuente: "${fuente.name}" (${fuente.id})`)

  // ── 3. Intentar con video (requerido por Chromium para desktop source) ─
  let stream = null

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource:   'desktop',
          chromeMediaSourceId: fuente.id,
          echoCancellation:    false,
          noiseSuppression:    false,
          autoGainControl:     false,
        },
        // FIX #2: hint de sampleRate fuera de mandatory (más compatible)
        sampleRate: 16000,
      },
      video: {
        // FIX #1: constraints de resolución mínima fuera de mandatory
        mandatory: {
          chromeMediaSource:   'desktop',
          chromeMediaSourceId: fuente.id,
        },
        width:     { max: 1 },
        height:    { max: 1 },
        frameRate: { max: 1 },
      },
    })
  } catch (e) {
    // FIX #3: fallback sin video si falla por constraint de video
    if (e.name === 'OverconstrainedError' || e.name === 'NotSupportedError') {
      console.warn(`[ElectronCapture] Fallo con video (${e.name}), reintentando solo audio…`)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource:   'desktop',
              chromeMediaSourceId: fuente.id,
              echoCancellation:    false,
              noiseSuppression:    false,
              autoGainControl:     false,
            },
          },
          video: false,
        })
      } catch (e2) {
        console.error('[ElectronCapture] Fallback audio-only también falló:', e2.name, e2.message)
        // cae al handler de error principal abajo
        e = e2
      }
    }

    if (!stream) {
      let userMessage
      switch (e.name) {
        case 'NotAllowedError':
          userMessage =
            'Permiso denegado. En main.js asegúrate de que setPermissionRequestHandler ' +
            'permite "media" y "display-capture".'
          break
        case 'OverconstrainedError':
          userMessage = `Constraints incompatibles con la fuente (${e.constraint}). Reporta este error.`
          break
        case 'NotFoundError':
          userMessage = 'No se encontró dispositivo de captura de pantalla.'
          break
        default:
          userMessage = `Error al capturar audio del sistema: ${e.name} — ${e.message}`
      }
      console.error('[ElectronCapture]', e.name, e.message)
      return { stream: null, userMessage }
    }
  }

  // ── 4. Verificar pistas de audio ANTES de descartar video ─────────────
  const audioTracks = stream.getAudioTracks()
  if (audioTracks.length === 0) {
    stream.getTracks().forEach(t => t.stop())
    console.error('[ElectronCapture] Stream sin pistas de audio.')
    return {
      stream:      null,
      userMessage:
        'No se obtuvo audio del sistema. En Linux puede requerir PulseAudio ' +
        'o configuración adicional de loopback.',
    }
  }

  // ── 5. Descartar pistas de video ──────────────────────────────────────
  stream.getVideoTracks().forEach(t => {
    t.stop()
    stream.removeTrack(t)
  })

  // ── 6. Log de info del track ──────────────────────────────────────────
  const settings = audioTracks[0].getSettings()
  console.log(
    `[ElectronCapture] ✅ Audio del sistema listo\n` +
    `  Label:      ${audioTracks[0].label}\n` +
    `  SampleRate: ${settings.sampleRate   ?? '?'} Hz\n` +
    `  Channels:   ${settings.channelCount ?? '?'}\n` +
    `  SampleSize: ${settings.sampleSize   ?? '?'} bits`
  )

  return { stream, userMessage: null }
}
