/**
 * hooks/useTranscription.js  —  Transcripción en tiempo real con Deepgram
 *
 * FLUJO:
 *   1. Se abre un WebSocket a Deepgram con el API key del usuario
 *   2. MediaRecorder divide el audio en chunks de 250ms y los envía al WS
 *   3. Deepgram devuelve transcripciones interim (mientras habla) y finales
 *   4. onInterim({ text, lang }) → texto provisional en pantalla
 *   5. onFinal({ text, lang })   → texto confirmado, se guarda permanentemente
 *
 * POR QUÉ NO usamos Web Speech API:
 *   webkitSpeechRecognition necesita las claves internas de Chrome para
 *   autenticarse con Google. Electron no las incluye → Error: -2 en cada intento.
 *   Ver: https://github.com/electron/electron/issues/46143
 */

import { useCallback, useRef, useState } from 'react'

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen'


export function useTranscription({
  lang = 'en-US',
  onFinal,
  onInterim,
  onError,
} = {}) {

  // Referencias persistentes (no causan re-renders al cambiar)
  const socketRef   = useRef(null)   // WebSocket de Deepgram
  const recorderRef = useRef(null)   // MediaRecorder activo
  const activoRef   = useRef(false)  // estado de actividad sin stale-closure

  const [active, setActive] = useState(false)
  const [error,  setError]  = useState(null)

  // Emite un error al estado local Y al callback externo
  const emitirError = useCallback((msg) => {
    console.error('[Deepgram]', msg)
    setError(msg)
    onError?.(msg)
  }, [onError])


  // ── Iniciar transcripción ─────────────────────────────────────
  const start = useCallback(async (stream = null) => {

    // Evita abrir dos conexiones si ya está activo
    if (activoRef.current) return

    const API_KEY = localStorage.getItem('app_key')
    if (!API_KEY) {
      emitirError('Falta el API key de Deepgram')
      return
    }

    // Si no recibimos un stream, pedimos el micrófono directamente
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (e) {
        emitirError('Micrófono denegado: ' + e.message)
        return
      }
    }

    // Parámetros del WebSocket de Deepgram
    // 'multi' = detección automática del idioma (EN/ES simultáneo)
    const params = new URLSearchParams({
      model:           'nova-2',
      language:        lang,
      smart_format:    'true',
      interim_results: 'true',
      punctuate:       'true',
    })

    const ws = new WebSocket(
      `${DEEPGRAM_URL}?${params}`,
      ['token', API_KEY]
    )
    socketRef.current = ws


    // ── Cuando el WebSocket abre ──────────────────────────────
    ws.onopen = () => {
      activoRef.current = true
      setActive(true)
      console.log('✅ Deepgram conectado')

      // Elegimos el mejor formato soportado por el navegador/Electron
      // IMPORTANTE: NO pasamos encoding a Deepgram — él auto-detecta webm/opus
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })

      // Enviamos cada chunk de audio al WebSocket
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data)
        }
      }

      recorder.start(250) // un chunk cada 250ms → ~4 paquetes por segundo
      recorderRef.current = recorder
    }


    // ── Cuando llega un mensaje de Deepgram ───────────────────
    ws.onmessage = (msg) => {
      let data
      try { data = JSON.parse(msg.data) } catch { return }

      // Solo procesamos mensajes de tipo "Results" (ignoramos metadatos)
      if (data.type !== 'Results') return

      const alt            = data.channel?.alternatives?.[0]
      const texto          = alt?.transcript?.trim()
      const idiomaDetectado = alt?.languages?.[0] || 'en'

      if (!texto) return  // silencio o fragmento vacío

      const payload = { text: texto, lang: idiomaDetectado }

      if (data.is_final) {
        onFinal?.(payload)    // oración completa y confirmada
      } else {
        onInterim?.(payload)  // texto en progreso mientras habla
      }
    }


    ws.onerror = () => emitirError('Error en el WebSocket de Deepgram')

    ws.onclose = (e) => {
      console.log(`🔌 Deepgram cerrado — código: ${e.code}`, e.reason || '')
      // Código 1008 = API key inválido
      if (e.code === 1008) emitirError('API key de Deepgram rechazado (código 1008)')
      activoRef.current = false
      setActive(false)
    }

  }, [lang, onFinal, onInterim, emitirError])


  // ── Detener transcripción ─────────────────────────────────────
  const stop = useCallback(() => {
    activoRef.current = false

    // Detenemos el grabador y cerramos el socket limpiamente
    recorderRef.current?.stop()
    recorderRef.current = null

    socketRef.current?.close(1000, 'Usuario detuvo la grabación')
    socketRef.current = null

    setActive(false)
    setError(null)
  }, [])


  return { start, stop, active, error }
}
