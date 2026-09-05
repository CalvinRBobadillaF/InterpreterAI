// hooks/useTranscription.js
//
// RESTAURADO tal cual funcionaba antes de introducir Gladia — Deepgram
// nunca tuvo bugs reportados en EN/ES, así que no hay razón para
// reinventarlo. Vuelve a ser el pipeline para inglés/español.
//
// Solo captura EN y ES — Criollo Haitiano nunca pasa por aquí, porque
// Deepgram no lo reconoce en NINGÚN modelo de streaming. Para eso está
// useGladiaTranscription.js.

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
    endpointing:      '300',
    utterance_end_ms: '1200',
    no_delay:         'true',
    vad_events:       'true',
    diarize:          'false',
  })
  return `${DEEPGRAM_URL}?${params}`
}

const ALLOWED_LANGS = new Set(['en', 'es'])

function isAllowedLang(lang) {
  if (!lang) return false
  const prefix = lang.slice(0, 2).toLowerCase()
  return ALLOWED_LANGS.has(prefix)
}

export function useTranscription({ onFinal, onInterim, onError } = {}) {
  const wsRef       = useRef(null)
  const recorderRef = useRef(null)
  const activoRef   = useRef(false)

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

    if (!isAllowedLang(detectedLang)) {
      console.debug(`[Deepgram] Idioma descartado (solo en/es): "${detectedLang}" — "${texto.slice(0, 30)}"`)
      return
    }

    const payload = {
      text:        texto,
      lang:        detectedLang.slice(0, 2).toLowerCase(),
      confidence,
      speechFinal: data.speech_final ?? data.is_final,
    }

    if (data.is_final) onFinalRef.current?.(payload)
    else               onInterimRef.current?.(payload)
  }, [])

  const start = useCallback(async (stream = null) => {
    if (activoRef.current) return true

    const API_KEY = localStorage.getItem('app_key')?.trim()
    if (!API_KEY) {
      emitirError('Missing Deepgram API key')
      return false
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
        return false
      }
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const ws = new WebSocket(buildWsUrl(), ['token', API_KEY])
    wsRef.current = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      console.log('[Deepgram] ✅ Connected — nova-3 / multi (en+es only)')
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

      recorder.start(50)
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

    return true
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
