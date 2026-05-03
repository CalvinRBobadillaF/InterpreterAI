// hooks/useTranscription.js  v3
//
// MEJORAS en esta versión:
// ─────────────────────────────────────────────────────────────────────
// 1. RESTRICCIÓN EN/ES: si Deepgram detecta un idioma que NO es inglés
//    ni español, se descarta el resultado silenciosamente. Esto evita
//    que ruido de fondo o palabras similares a otros idiomas generen
//    cards incorrectos o traducciones absurdas.
//
// 2. KEYWORDS: parámetro de Deepgram para mejorar accuracy en vocabulario
//    específico. Puedes customizarlo según el dominio (médico, legal, etc.).
//    Deepgram boostea el reconocimiento de estas palabras específicas.
//    Sintaxis: "palabra:boost" donde boost es 1-10 (default 1).
//
// 3. LANGUAGE CONFIDENCE: solo procesar si el idioma detectado tiene al
//    menos un canal de alternativas. Deepgram's nova-3 multi es muy bueno
//    pero en silencio o ruido puede emitir resultados con idioma extraño.
//
// 4. Mantenidos: endpointing 300ms, no_delay, timeslice 50ms,
//    stale-closure fix, speechFinal signal, API key trim.

import { useCallback, useRef, useState } from 'react'

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen'

// ── NUEVO: keywords para mejorar accuracy ────────────────────────────────
// Agrega términos de tu dominio aquí. Formato: "término:peso" (peso 1-10).
// Ejemplos para uso médico: 'paciente:2', 'diagnóstico:2', 'tratamiento:2'
// Para uso general puedes dejarlo vacío o customizarlo.


const buildWsUrl = () => {
  const params = new URLSearchParams({
    model:            'nova-3',
    language:         'multi',
    smart_format:     'true',
    punctuate:        'true',
    numerals:         'true',
    interim_results:  'true',
    filler_words:     'false',
    endpointing:      '300',
    utterance_end_ms: '1200',
    no_delay:         'true',
    vad_events:       'true',
    diarize:          'false',
  })

  // FIX #2: Agregar keywords
  

  return `${DEEPGRAM_URL}?${params}`
}

// ── FIX #1: Solo aceptar EN y ES ─────────────────────────────────────────
const ALLOWED_LANGS = new Set(['en', 'es', 'en-US', 'en-GB', 'es-419', 'es-ES'])

function isAllowedLang(lang) {
  if (!lang) return false
  if (ALLOWED_LANGS.has(lang)) return true
  // Revisar prefijo de 2 letras
  const prefix = lang.slice(0, 2).toLowerCase()
  return prefix === 'en' || prefix === 'es'
}

export function useTranscription({ onFinal, onInterim, onError } = {}) {
  const wsRef       = useRef(null)
  const recorderRef = useRef(null)
  const activoRef   = useRef(false)

  // Refs para stale-closure fix — siempre apuntan a la versión más reciente
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
  }, [])

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

    // FIX #1 + #3: Descartar si el idioma detectado no es EN ni ES
    if (!isAllowedLang(detectedLang)) {
      console.debug(`[Deepgram] Idioma descartado: "${detectedLang}" — "${texto.slice(0, 30)}"`)
      return
    }

    const payload = {
      text:        texto,
      lang:        detectedLang,
      confidence,
      speechFinal: data.speech_final ?? data.is_final,
    }

    if (data.is_final) onFinalRef.current?.(payload)
    else               onInterimRef.current?.(payload)
  }, [])

  const start = useCallback(async (stream = null) => {
    if (activoRef.current) return

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
      console.log('[Deepgram] ✅ Connected — nova-3 / multi / EN+ES only / no_delay')
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

      recorder.start(50)  // 50ms timeslice — doble de frecuente que antes
      recorderRef.current = recorder
    }

    ws.onmessage = handleMessage

    ws.onerror = () => {
      console.warn('[Deepgram] onerror — waiting for onclose details')
    }

    ws.onclose = (e) => {
      console.log(`[Deepgram] Closed — code:${e.code} reason:"${e.reason}"`)
      const wasActive = activoRef.current
      activoRef.current = false
      setActive(false)

      if (wasActive && !e.wasClean) {
        const msg =
          e.reason        ? e.reason :
          e.code === 1006 ? 'Connection lost — check API key or network' :
          e.code === 1008 ? 'Rejected by Deepgram — invalid params or key' :
          e.code === 1011 ? 'Deepgram internal error — try again' :
                            `Closed unexpectedly (code ${e.code})`
        emitirError(msg)
      }
    }
  }, [emitirError, handleMessage])

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
