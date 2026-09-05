// hooks/useGladiaTranscription.js
//
// SIMPLIFICADO tras pruebas reales — dos fixes importantes:
//
// FIX #1 — "no detecta nada hablando Kreyòl":
//   Antes usaba detección automática abierta (languages: [] + code_switching)
//   confiando en que reconocería en/es/ht por igual. En la práctica, esa
//   detección amplia entre 100+ idiomas es poco confiable justo con
//   idiomas de bajo recurso como Kreyòl — el modelo tiende a confundirlo
//   con francés o no priorizarlo. SOLUCIÓN: este hook ahora apunta
//   EXPLÍCITAMENTE a Kreyòl (`languages: ['ht']`), sin dejar que el
//   modelo adivine entre cientos de idiomas. Por eso ya no maneja EN/ES
//   — para eso está useTranscription.js (Deepgram), que nunca falló.
//
// FIX #2 — "siempre hay que darle Retry":
//   Ya NO se usa la traducción en vivo integrada de Gladia — tenía un
//   bug de correlación de mensajes que no pude confirmar sin una key
//   propia para probarlo. Este hook ahora SOLO hace transcripción
//   (speech-to-text). La traducción de lo que devuelve pasa por la
//   MISMA ruta que ya usa "Retry" (translateText, en useTranslation.js)
//   — la que sí funciona — llamada automáticamente desde App.jsx.
//
// FIX #3 (bonus, encontrado al revisar el código con lupa):
//   La petición POST /v2/live mandaba sample_rate:16000 HARDCODEADO
//   antes de siquiera crear el AudioContext — si el navegador no
//   respetaba exactamente 16000Hz (algunos no lo hacen), el audio real
//   iba a una velocidad distinta a la que le dijimos a Gladia, lo cual
//   puede sonar irreconocible del otro lado. Ahora se crea el
//   AudioContext PRIMERO, se lee su sampleRate REAL, y ESE valor es el
//   que se manda en la petición — nunca un valor asumido.
//
// Sigue usando PCM crudo (Web Audio API) porque Gladia no acepta
// webm/opus como Deepgram.

import { useCallback, useRef, useState } from 'react'

const GLADIA_INIT_URL = 'https://api.gladia.io/v2/live'
const BUFFER_SIZE     = 4096 // muestras por callback (~256ms a 16kHz)

function floatTo16BitPCM(float32Array) {
  const int16Array = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16Array
}

export function useGladiaTranscription({ onFinal, onInterim, onError } = {}) {
  const wsRef         = useRef(null)
  const audioCtxRef   = useRef(null)
  const processorRef  = useRef(null)
  const sourceNodeRef = useRef(null)
  const activoRef     = useRef(false)

  const onFinalRef   = useRef(onFinal)
  const onInterimRef = useRef(onInterim)
  const onErrorRef   = useRef(onError)
  onFinalRef.current   = onFinal
  onInterimRef.current = onInterim
  onErrorRef.current   = onError

  const [active, setActive] = useState(false)
  const [error,  setError]  = useState(null)

  const emitirError = useCallback((msg) => {
    console.error('[Gladia]', msg)
    setError(msg)
    onErrorRef.current?.(msg)
  }, [])

  const handleMessage = useCallback((event) => {
    let msg
    try { msg = JSON.parse(event.data) } catch { return }

    if (msg.type === 'error') {
      emitirError(msg.data?.message || JSON.stringify(msg.data))
      return
    }

    if (msg.type !== 'transcript') return // ya no nos importa "translation" — ver FIX #2

    const d         = msg.data
    const utterance = d?.utterance
    const texto     = utterance?.text?.trim()

    if (!texto || texto.length < 2) return

    const payload = { text: texto, lang: 'ht', confidence: utterance?.confidence ?? 1, speechFinal: true }

    if (d.is_final) onFinalRef.current?.(payload)
    else            onInterimRef.current?.(payload)
  }, [emitirError])

  const start = useCallback(async (stream = null) => {
    if (activoRef.current) return true

    const API_KEY = localStorage.getItem('gladia_key')?.trim()
    if (!API_KEY) {
      emitirError('Missing Gladia API key')
      return false
    }

    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { autoGainControl: true, noiseSuppression: true, echoCancellation: true }
        })
      } catch (e) {
        emitirError('Microphone denied: ' + e.message)
        return false
      }
    }

    // ── FIX #3: creamos el AudioContext PRIMERO para saber el sample
    // rate REAL antes de decirle a Gladia qué esperar ──────────────────
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    const audioCtx = new AudioContextClass({ sampleRate: 16000 })
    audioCtxRef.current = audioCtx
    const actualSampleRate = audioCtx.sampleRate

    if (actualSampleRate !== 16000) {
      console.warn(`[Gladia] El navegador usó ${actualSampleRate}Hz en vez de 16000Hz — usando el valor real en la config.`)
    }

    let sessionUrl
    try {
      const res = await fetch(GLADIA_INIT_URL, {
        method: 'POST',
        headers: {
          'x-gladia-key': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          encoding:    'wav/pcm',
          sample_rate: actualSampleRate, // ← el REAL, no un valor asumido
          bit_depth:   16,
          channels:    1,
          model:       'solaria-1',
          endpointing: 0.3,
          maximum_duration_without_endpointing: 10,
          // FIX #1: idioma explícito, sin dejar que el modelo adivine
          // entre 100+ idiomas (eso es lo que fallaba con Kreyòl)
          language_config: {
            languages:      ['ht'],
            code_switching: false,
          },
          // FIX #2: sin traducción en vivo de Gladia — la traducción la
          // hace translateText() desde App.jsx, la ruta que sí funciona
          // NUEVO: limpieza de audio antes de transcribir — ayuda justo en
          // los casos que describiste (mic de teléfono, conversación en
          // persona con ruido de fondo). Viene apagado por defecto en la
          // API, así que hay que activarlo explícitamente.
          pre_processing: {
            audio_enhancer: true,
          },
          realtime_processing: { translation: false },
          messages_config: {
            receive_partial_transcripts: true,
            receive_final_transcripts:   true,
            receive_speech_events:       false,
            receive_errors:              true,
            receive_lifecycle_events:    false,
          },
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.message || `HTTP ${res.status}`)
      }
      sessionUrl = (await res.json()).url
    } catch (e) {
      emitirError('Gladia init failed: ' + e.message)
      audioCtx.close().catch(() => {})
      audioCtxRef.current = null
      return false
    }

    const ws = new WebSocket(sessionUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log(`[Gladia] ✅ Connected — solaria-1, Kreyòl explícito, ${actualSampleRate}Hz`)
      activoRef.current = true
      setActive(true)
      setError(null)

      const source = audioCtx.createMediaStreamSource(stream)
      sourceNodeRef.current = source

      const processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!activoRef.current || ws.readyState !== WebSocket.OPEN) return
        const pcm16 = floatTo16BitPCM(e.inputBuffer.getChannelData(0))
        ws.send(pcm16.buffer)
      }

      const silentGain = audioCtx.createGain()
      silentGain.gain.value = 0
      source.connect(processor)
      processor.connect(silentGain)
      silentGain.connect(audioCtx.destination)
    }

    ws.onmessage = handleMessage
    ws.onerror = () => console.warn('[Gladia] onerror — esperando detalles en onclose')

    ws.onclose = (e) => {
      console.log(`[Gladia] Closed — code:${e.code} reason:"${e.reason}"`)
      const wasActive = activoRef.current
      activoRef.current = false
      setActive(false)
      if (wasActive && e.code !== 1000) {
        emitirError(e.reason || `Connection closed unexpectedly (code ${e.code})`)
      }
    }

    return true
  }, [emitirError, handleMessage])

  const stop = useCallback(() => {
    activoRef.current = false

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ type: 'stop_recording' })) } catch { /* noop */ }
    }
    wsRef.current?.close(1000, 'User stopped')
    wsRef.current = null

    processorRef.current?.disconnect()
    sourceNodeRef.current?.disconnect()
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
    }
    processorRef.current = null
    sourceNodeRef.current = null
    audioCtxRef.current = null

    setActive(false)
    setError(null)
  }, [])

  return { start, stop, active, error }
}
