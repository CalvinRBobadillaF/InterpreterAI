/**
 * hooks/useTranscription.js  —  Deepgram WebSocket streaming
 * ─────────────────────────────────────────────────────────────────
 * ROOT CAUSE OF "listening but no text" bug:
 *
 *   Previous version sent `encoding=linear16&sample_rate=16000` to Deepgram,
 *   but MediaRecorder actually outputs audio/webm;codecs=opus (compressed).
 *   Deepgram tried to decode a webm container as raw PCM → got garbage → dropped
 *   every packet silently. No error, no transcript.
 *
 * FIX:
 *   Remove `encoding` and `sample_rate` params entirely.
 *   Deepgram auto-detects the container format from the first bytes of each chunk.
 *   audio/webm;codecs=opus is fully supported by Deepgram out of the box.
 * ─────────────────────────────────────────────────────────────────
 */

import { useCallback, useRef, useState } from 'react'

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen'


    

export function useTranscription({
  lang = 'en-US',
  onFinal,
  onInterim,
  onError,
} = {}) {

  const socketRef   = useRef(null)
  const recorderRef = useRef(null)
  const activeRef   = useRef(false)

  const [active, setActive] = useState(false)
  const [error, setError]   = useState(null)

  const emitError = useCallback((msg) => {
    console.error('[Deepgram]', msg)
    setError(msg)
    onError?.(msg)
  }, [onError])

  const start = useCallback(async (stream = null) => {

    if (activeRef.current) return
    const API_KEY = localStorage.getItem('app_key')
    if (!API_KEY) {
      emitError('Missing Deepgram API key')
      return
    }

    // ── Get mic if needed ──
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        })
      } catch (e) {
        emitError('Mic access denied: ' + e.message)
        return
      }
    }

    // Reemplaza tu bloque de params por este:
    const params = new URLSearchParams({
      model: 'nova-2',
      language: lang, // 🔥 Esto tomará el valor 'multi' que le envías desde App.jsx
      smart_format: 'true',
      interim_results: 'true',
      punctuate: 'true',
    })

    // La inicialización del WebSocket se queda igual a la corrección anterior:
    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?${params.toString()}`,
      ['token', API_KEY]
    )

    socketRef.current = ws

    

    ws.onopen = () => {
  activeRef.current = true
  setActive(true)

  console.log('🎤 WS OPEN - starting recorder')

  const recorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
  })

  recorder.ondataavailable = (e) => {
    console.log('📦 chunk:', e.data.size)

    if (e.data.size > 0 && ws.readyState === 1) {
      ws.send(e.data)
    }
  }

  recorder.onerror = (e) => console.log('recorder error', e)

  recorder.start(250)
  recorderRef.current = recorder
}

    

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data)

      if (!data.channel?.alternatives?.length) return

      const alt = data.channel.alternatives[0]
      const text = alt.transcript?.trim()
      const langDetected = alt.languages?.[0] || 'unknown'

      if (!text) return

      const payload = {
        text,
        lang: langDetected,
        isFinal: data.is_final,
      }

      if (data.is_final) {
        onFinal?.(payload)
      } else {
        onInterim?.(payload)
      }
    }

    ws.onerror = (e) => {
      emitError('WebSocket error')
    }

    ws.onclose = (e) => {
  console.log('CLOSE CODE:', e.code)
  console.log('REASON:', e.reason)
}

  }, [lang, onFinal, onInterim, emitError])

  const stop = useCallback(() => {

    activeRef.current = false

    recorderRef.current?.stop()
    recorderRef.current = null

    socketRef.current?.close(1000, 'stop')
    socketRef.current = null

    setActive(false)
  }, [])

  return { start, stop, active, error }
}