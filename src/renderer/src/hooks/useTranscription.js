// hooks/useTranscription.js

import { useCallback, useRef, useState } from 'react'

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen'

// 🚀 OPTIMIZACIÓN DE PRECISIÓN: Vocabulario de alta prioridad para OPI.
// Formato 'término:multiplicador' (1 a 10). 
// Ayuda a Nova-3 a clavar términos técnicos que suelen perderse por el acento o ruido.


export function useTranscription({
  onFinal,
  onInterim,
  onError,
} = {}) {

  const socketRef   = useRef(null)
  const recorderRef = useRef(null)
  const activoRef   = useRef(false)

  const [active, setActive] = useState(false)
  const [error,  setError]  = useState(null)

  const emitirError = useCallback((msg) => {
    console.error('[Deepgram]', msg)
    setError(msg)
    onError?.(msg)
  }, [onError])

  // ── Iniciar ───────────────────────────────────────────────────
  const start = useCallback(async (stream = null) => {
    if (activoRef.current) return

    const API_KEY = localStorage.getItem('app_key')
    if (!API_KEY) { emitirError('Falta el API key de Deepgram'); return }

    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl:  true,
            noiseSuppression: true,
            echoCancellation: true,
            sampleRate:       16000, // ⚡ Optimización: 16kHz es el estándar de Deepgram. Evita conversiones de formato.
          }
        })
      } catch (e) {
        emitirError('Micrófono denegado: ' + e.message)
        return
      }
    }

    // ── Parámetros de Deepgram ──────────────────────────────────
    // ── Parámetros de Deepgram ──────────────────────────────────
    const params = new URLSearchParams({
      model:            'nova-3',
      language:         'multi', 
      smart_format:     'true',  
      punctuate:        'true',
      interim_results:  'true',
      filler_words:     'false',
      
      // 👇 AUMENTADOS PARA FORZAR PÁRRAFOS MÁS LARGOS 👇
      endpointing:      '1500',  // 1.5 segundos de silencio real para cortar.
      utterance_end_ms: '3000',  // 3 segundos de límite absoluto de silencio.
      
      vad_events:       'true',
    })

    // ⚡ Inyectamos las keywords al URLSearchParams (Genera &keywords=Medicare:2&keywords=Medicaid:2...)
    

    const wsUrl = `${DEEPGRAM_URL}?${params}`
    console.log('🔌 Conectando a Deepgram...')

    const ws = new WebSocket(wsUrl, ['token', API_KEY])
    socketRef.current = ws

    // ── WebSocket abierto ─────────────────────────────────────
    ws.onopen = () => {
      console.log('✅ Deepgram conectado — modelo: nova-3, idioma: multi')
      activoRef.current = true
      setActive(true)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data)
        }
      }

      // ⚡ Optimización de latencia: Enviar fragmentos cada 100ms en lugar de 150ms.
      // Provee un flujo de texto "interim" mucho más líquido y continuo en la pantalla.
      recorder.start(100) 
      recorderRef.current = recorder
    }

    // ── Mensajes de Deepgram ──────────────────────────────────
    ws.onmessage = (msg) => {
      let data
      try { data = JSON.parse(msg.data) } catch { return }

      if (data.type !== 'Results') return

      const alt        = data.channel?.alternatives?.[0]
      const texto      = alt?.transcript?.trim()
      const idioma     = alt?.languages?.[0] || 'en'
      const confidence = alt?.confidence ?? 0

      if (!texto || texto.length < 2) return

      // Ligeramente más permisivo con el texto interim (bajado a 0.55) para dar más 
      // contexto visual rápido mientras se corrige a sí mismo.
      if (!data.is_final && confidence < 0.55) return 

      const payload = { text: texto, lang: idioma, confidence }

      if (data.is_final) {
        onFinal?.(payload)
      } else {
        onInterim?.(payload)
      }
    }

    ws.onerror = (err) => {
      console.error('❌ WebSocket error:', err)
      emitirError('Error de conexión con Deepgram')
    }

    ws.onclose = (e) => {
      console.log(`🔌 Deepgram cerrado — código: ${e.code}`, e.reason || '')
      const razones = {
        1008: 'API key de Deepgram inválido o expirado',
        1011: 'Error interno de Deepgram — intenta de nuevo',
      }
      if (razones[e.code]) emitirError(razones[e.code])
      activoRef.current = false
      setActive(false)
    }

  }, [onFinal, onInterim, emitirError])

  // ── Detener ───────────────────────────────────────────────────
  const stop = useCallback(() => {
    activoRef.current = false
    recorderRef.current?.stop()
    recorderRef.current = null
    socketRef.current?.close(1000, 'Usuario detuvo la grabación')
    socketRef.current = null
    setActive(false)
    setError(null)
  }, [])

  return { start, stop, active, error }
}