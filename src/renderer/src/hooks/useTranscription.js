// hooks/useTranscription.js
//
// FIXES en esta versión:
// ─────────────────────────────────────────────────────────────────────
// 1. STALE CLOSURES: onFinal/onInterim se guardan en refs actualizadas
//    en cada render. Sin esto, el closure del ws.onmessage captura la
//    versión vieja de los callbacks y los finals se "pierden" silenciosamente.
//
// 2. UTTERANCES MÁS LARGOS: endpointing=800ms + utterance_end_ms=2500ms.
//    Deepgram espera 800ms de silencio real antes de cortar — las oraciones
//    largas llegan completas. Sin sacrificar latencia (interim sigue en vivo).
//
// 3. SENTENCE MERGER SIGNAL: cada is_final incluye `speechFinal` de Deepgram.
//    Si es false, significa que Deepgram considera que la oración no terminó
//    → App.jsx puede acumular y no crear un card nuevo todavía.
//
// 4. API KEY TRIMMEADA: espacios o newlines en localStorage rompen la auth.
//
// 5. ONERROR mejorado: WebSocket.onerror casi nunca tiene .message útil —
//    el error real llega en onclose con e.code + e.reason.

import { useCallback, useRef, useState } from 'react'

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen'

const buildWsUrl = () => {
  const params = new URLSearchParams({
    model:            'nova-3',
    language:         'multi',
    smart_format:     'true',
    punctuate:        'true',
    numerals:         'true',
    interim_results:  'true',
    filler_words:     'false',

    // 800ms: oraciones largas llegan completas sin sacrificar latencia
    endpointing:      '800',
    // 2500ms: margen absoluto para pausas dentro de una misma idea
    utterance_end_ms: '2500',

    vad_events:       'true',
    diarize:          'false',
  })
  return `${DEEPGRAM_URL}?${params}`
}

export function useTranscription({ onFinal, onInterim, onError } = {}) {
  const wsRef       = useRef(null)
  const recorderRef = useRef(null)
  const activoRef   = useRef(false)

  // FIX #1: Refs para callbacks — siempre apuntan a la versión más reciente.
  // Sin esto, ws.onmessage captura el closure viejo y los callbacks
  // después de cada re-render apuntan a versiones stale.
  const onFinalRef   = useRef(onFinal)
  const onInterimRef = useRef(onInterim)
  const onErrorRef   = useRef(onError)
  onFinalRef.current   = onFinal
  onInterimRef.current = onInterim
  onErrorRef.current   = onError

  const [active, setActive] = useState(false)
  const [error,  setError]  = useState(null)

  const emitirError = useCallback((msg) => {
    console.error('[Deepgram]', msg)
    setError(msg)
    onErrorRef.current?.(msg)
  }, []) // Sin dependencias — usa ref siempre actualizada

  // ── Procesador de mensajes (estable, sin recrearse) ───────────────────
  const handleMessage = useCallback((msg) => {
    let data
    try { data = JSON.parse(msg.data) } catch { return }

    if (data.type === 'SpeechStarted') return
    if (data.type === 'UtteranceEnd')  return
    if (data.type !== 'Results')       return

    const alt          = data.channel?.alternatives?.[0]
    const texto        = alt?.transcript?.trim()
    const confidence   = alt?.confidence ?? 0
    const detectedLang = alt?.languages?.[0] ?? 'en'

    if (!texto || texto.length < 2)          return
    if (!data.is_final && confidence < 0.50) return

    // FIX #3: `speech_final` es la señal de Deepgram de que la oración
    // terminó semánticamente (no solo por silencio). App.jsx la usa
    // para decidir si crear un card nuevo o acumular más texto.
    const payload = {
      text:        texto,
      lang:        detectedLang,
      confidence,
      speechFinal: data.speech_final ?? data.is_final,
    }

    if (data.is_final) onFinalRef.current?.(payload)
    else               onInterimRef.current?.(payload)
  }, []) // Estable — usa refs, no cierra sobre props

  // ── Iniciar ────────────────────────────────────────────────────────────
  const start = useCallback(async (stream = null) => {
    if (activoRef.current) return

    // FIX #4: trim() elimina espacios/newlines que rompen autenticación
    const API_KEY = localStorage.getItem('app_key')?.trim()
    if (!API_KEY) {
      emitirError('Missing Deepgram API key')
      return
    }

    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl:  true,
            noiseSuppression: true,
            echoCancellation: true,
            sampleRate:       16000,
          }
        })
      } catch (e) {
        emitirError('Microphone denied: ' + e.message)
        return
      }
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    console.log('[Deepgram] Connecting…')
    const ws = new WebSocket(buildWsUrl(), ['token', API_KEY])
    wsRef.current = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      console.log('[Deepgram] ✅ Connected — nova-3 / multi')
      activoRef.current = true
      setActive(true)
      setError(null)

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 32000,
      })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data)
        }
      }

      recorder.start(100)
      recorderRef.current = recorder
    }

    ws.onmessage = handleMessage

    // FIX #5: onerror casi nunca tiene .message útil en WebSockets.
    // El error real (código + razón) llega en onclose.
    ws.onerror = () => {
      console.warn('[Deepgram] onerror fired — waiting for onclose details')
    }

    ws.onclose = (e) => {
      console.log(`[Deepgram] Closed — code:${e.code} reason:"${e.reason}"`)
      const wasActive = activoRef.current
      activoRef.current = false
      setActive(false)

      // Solo emitir error si cerró inesperadamente mientras estaba activo
      if (wasActive && !e.wasClean) {
        const msg =
          e.reason                   ? e.reason :
          e.code === 1006            ? 'Connection lost — check API key or network' :
          e.code === 1008            ? 'Rejected by Deepgram — invalid params or key' :
          e.code === 1011            ? 'Deepgram internal error — try again' :
                                       `Closed unexpectedly (code ${e.code})`
        emitirError(msg)
      }
    }
  }, [emitirError, handleMessage])

  // ── Detener ────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    activoRef.current = false
    recorderRef.current?.stop()
    recorderRef.current = null
    wsRef.current?.close(1000, 'User stopped')
    wsRef.current = null
    setActive(false)
    setError(null)
  }, [])

  return { start, stop, active, error }
}
