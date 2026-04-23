/**
 * hooks/useTranscription.js
 *
 * ── CORRECCIÓN DE BUG (TIMEOUTS) ──────────────────────────────────
 * Se agregó un intervalo de KeepAlive. Deepgram cierra conexiones si no
 * reciben audio en ~10-12s. Ahora enviamos {"type": "KeepAlive"} al
 * WebSocket inactivo para mantenerlo vivo durante llamadas largas.
 *
 * ── NUEVO: MODO AUTOMÁTICO ────────────────────────────────────────
 * Si isAutoMode es true, abre 1 solo WebSocket con language='multi'
 * Si es false, abre 2 WebSockets (en-US, es-419) con ruteo manual.
 */

import { useCallback, useRef, useState } from 'react'

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen'

export function useTranscription({
  onFinal,
  onInterim,
  onError,
  activeLangRef,
  isAutoMode // 👈 NUEVO: Define la estrategia de conexión
} = {}) {

  const wsEnRef = useRef(null)
  const wsEsRef = useRef(null)
  const wsAutoRef = useRef(null) // Para el modo automático
  
  const recorderRef = useRef(null)
  const activoRef   = useRef(false)
  const keepAliveInterval = useRef(null) // 👈 Referencia para el KeepAlive

  const [active, setActive] = useState(false)
  const [error,  setError]  = useState(null)

  const emitirError = useCallback((msg) => {
    console.error('[Deepgram]', msg)
    setError(msg)
    onError?.(msg)
  }, [onError])

  const buildWsUrl = (lang) => {
    const params = new URLSearchParams({
      model:            'nova-3',
      language:         lang,
      smart_format:     'true',
      punctuate:        'true',
      numerals:         'true',
      interim_results:  'true',
      no_delay:         'true',
      filler_words:     'false',
      endpointing:      '300',
      utterance_end_ms: '1500',
      diarize:          'false',
    })
    return `${DEEPGRAM_URL}?${params}`
  }

  const start = useCallback(async (stream = null) => {
    if (activoRef.current) return

    const API_KEY = localStorage.getItem('app_key')
    if (!API_KEY) { emitirError('Falta el API key de Deepgram'); return }

    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { autoGainControl: true, noiseSuppression: true, echoCancellation: true }
        })
      } catch (e) {
        emitirError('Micrófono denegado: ' + e.message)
        return
      }
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    // ── FUNCIÓN DE PROCESAMIENTO DE TEXTO ─────────────────────────
    const handleMessage = (msg, fixedLang = null) => {
      let data
      try { data = JSON.parse(msg.data) } catch { return }
      if (data.type !== 'Results') return

      const alt = data.channel?.alternatives?.[0]
      const texto = alt?.transcript?.trim()
      const confidence = alt?.confidence ?? 0
      
      // Si estamos en Auto, Deepgram detecta el idioma. Si estamos en Manual, usamos el fijo.
      const detectedLang = alt?.languages?.[0] || 'en'
      const finalLang = isAutoMode ? detectedLang : fixedLang

      // En manual, ignoramos el texto del canal inactivo para evitar cruces
      if (!isAutoMode && fixedLang !== activeLangRef.current) return;

      if (!texto || texto.length < 2) return
      if (!data.is_final && confidence < 0.65) return

      const payload = { text: texto, lang: finalLang, confidence }

      if (data.is_final) onFinal?.(payload)
      else onInterim?.(payload)
    }

    // ── ESTRATEGIA: MODO AUTOMÁTICO (1 WebSocket) ──────────────────
    if (isAutoMode) {
      console.log('🤖 Iniciando Deepgram en Modo Automático (multi)...')
      const ws = new WebSocket(buildWsUrl('multi'), ['token', API_KEY])
      wsAutoRef.current = ws

      ws.onopen = () => {
        activoRef.current = true
        setActive(true)
        const recorder = new MediaRecorder(stream, { mimeType })
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data)
        }
        recorder.start(150)
        recorderRef.current = recorder
      }
      ws.onmessage = (msg) => handleMessage(msg)
      ws.onerror = () => emitirError('Error en modo automático')
      ws.onclose = () => { activoRef.current = false; setActive(false) }

    } 
    // ── ESTRATEGIA: MODO MANUAL DE INTÉRPRETE (2 WebSockets) ───────
    else {
      console.log('🎛️ Iniciando Deepgram en Modo Manual (EN y ES)...')
      const wsEn = new WebSocket(buildWsUrl('en-US'), ['token', API_KEY])
      const wsEs = new WebSocket(buildWsUrl('es-419'), ['token', API_KEY])
      wsEnRef.current = wsEn
      wsEsRef.current = wsEs

      let conexiones = 0
      const checkReady = () => {
        conexiones++
        if (conexiones === 2) {
          activoRef.current = true
          setActive(true)

          // 🛡️ EL FIX DEL BUG: Latidos de corazón (KeepAlive)
          // Cada 8 segundos mandamos un JSON para que Deepgram no cierre el canal inactivo
          keepAliveInterval.current = setInterval(() => {
            const keepAliveMsg = JSON.stringify({ type: "KeepAlive" });
            if (wsEn.readyState === WebSocket.OPEN) wsEn.send(keepAliveMsg);
            if (wsEs.readyState === WebSocket.OPEN) wsEs.send(keepAliveMsg);
          }, 8000)

          const recorder = new MediaRecorder(stream, { mimeType })
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              const current = activeLangRef?.current || 'en-US'
              if (current === 'en-US' && wsEn.readyState === WebSocket.OPEN) wsEn.send(e.data)
              else if (current === 'es-419' && wsEs.readyState === WebSocket.OPEN) wsEs.send(e.data)
            }
          }
          recorder.start(150)
          recorderRef.current = recorder
        }
      }

      wsEn.onopen = checkReady
      wsEs.onopen = checkReady
      wsEn.onmessage = (msg) => handleMessage(msg, 'en-US')
      wsEs.onmessage = (msg) => handleMessage(msg, 'es-419')
      
      const onErr = () => emitirError('Error de conexión en modo manual')
      wsEn.onerror = onErr
      wsEs.onerror = onErr

      const onClose = () => {
        activoRef.current = false
        setActive(false)
        if (keepAliveInterval.current) clearInterval(keepAliveInterval.current)
      }
      wsEn.onclose = onClose
      wsEs.onclose = onClose
    }

  }, [onFinal, onInterim, emitirError, activeLangRef, isAutoMode])

  const stop = useCallback(() => {
    activoRef.current = false
    recorderRef.current?.stop()
    recorderRef.current = null
    
    // Limpiamos el intervalo de KeepAlive
    if (keepAliveInterval.current) clearInterval(keepAliveInterval.current)
    
    wsEnRef.current?.close(1000, 'Usuario detuvo')
    wsEsRef.current?.close(1000, 'Usuario detuvo')
    wsAutoRef.current?.close(1000, 'Usuario detuvo')
    
    wsEnRef.current = null
    wsEsRef.current = null
    wsAutoRef.current = null
    
    setActive(false)
    setError(null)
  }, [])

  return { start, stop, active, error }
}