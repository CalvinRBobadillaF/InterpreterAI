/**
 * hooks/useTranscription.js  —  Transcripción en tiempo real con Deepgram
 *
 * ── BUG CORREGIDO ──────────────────────────────────────────────────
 * El parámetro `detect_language: 'true'` es exclusivo de los modelos
 * `base` y `enhanced`. En `nova-2` y `nova-3` ese parámetro es inválido
 * y hace que Deepgram cierre la conexión WebSocket inmediatamente.
 *
 * La forma CORRECTA de habilitar multilenguaje en nova-2/nova-3 es:
 *   language: 'multi'
 *
 * ── OPTIMIZACIONES PARA LLAMADAS DE INTÉRPRETE ────────────────────
 * - nova-3: modelo más preciso de Deepgram, mejor con acentos hispanos
 * - language: 'multi': detecta EN y ES automáticamente en el mismo stream
 * - utterance_end_ms: 1500ms — pausa natural antes de cerrar una oración
 *   (en llamadas telefónicas hay más latencia de red, necesita más margen)
 * - endpointing: 300ms — detecta el final de turno del hablante
 * - filler_words: false — no transcribe "eh", "um", "este"
 * - no_delay: true — envía resultados en cuanto están listos
 * - numerals: true — "cuatro veinte" → "420" (útil para números de cuenta)
 * - diarize: false — no separamos hablantes (el intérprete habla uno a la vez)
 */

import { useCallback, useRef, useState } from 'react'

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen'

// Vocabulario especializado para llamadas de intérprete.
// Formato: 'término:prioridad' (1-5). Mantenlo corto — listas largas
// pueden aumentar la latencia de conexión inicial.



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

    // Pedimos micrófono si no recibimos un stream externo
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl:  true,   // amplifica voces bajas
            noiseSuppression: true,   // reduce ruido de fondo en llamadas
            echoCancellation: true,   // evita retroalimentación
          }
        })
      } catch (e) {
        emitirError('Micrófono denegado: ' + e.message)
        return
      }
    }

    // ── Parámetros de Deepgram ──────────────────────────────────
    // IMPORTANTE: NO usar detect_language con nova-2/nova-3.
    // Para multilenguaje en nova-3 se usa: language=multi
    const params = new URLSearchParams({
      model:            'nova-3',   // más preciso que nova-2, mejor con acentos
      language:         'multi',    // ✅ CORRECTO para nova-3 multilenguaje
                                    // ❌ NO usar detect_language=true con nova-3

      smart_format:     'true',     // capitalización, puntuación automática
      punctuate:        'true',     // agrega puntos, comas, signos de pregunta
      numerals:         'true',     // "cuatro veinte" → "420"
      interim_results:  'true',     // resultados en tiempo real mientras habla
      no_delay:         'true',     // envía resultados inmediatamente
      filler_words:     'false',    // omite "eh", "um", "este", "like"
      endpointing:      '300',      // ms de silencio para detectar fin de turno
      utterance_end_ms: '1500',     // ms de silencio para cerrar la utterance completa
                                    // 1500ms da margen para pausas de llamadas telefónicas
      diarize:          'false',    // no separar hablantes — el intérprete habla uno a la vez
    })

    
     

    const wsUrl = `${DEEPGRAM_URL}?${params}`
    console.log('🔌 Conectando a Deepgram...')

    // El API key se pasa como subprotocolo WebSocket (no en la URL)
    const ws = new WebSocket(wsUrl, ['token', API_KEY])
    socketRef.current = ws


    // ── WebSocket abierto ─────────────────────────────────────
    ws.onopen = () => {
      console.log('✅ Deepgram conectado — modelo: nova-3, idioma: multi')
      activoRef.current = true
      setActive(true)

      // audio/webm;codecs=opus: mejor compresión, menos bytes por paquete
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data)
        }
      }

      // 150ms de chunk = ~6-7 paquetes/seg → buena fluidez sin saturar la conexión
      recorder.start(150)
      recorderRef.current = recorder
    }


    // ── Mensajes de Deepgram ──────────────────────────────────
    ws.onmessage = (msg) => {
      let data
      try { data = JSON.parse(msg.data) } catch { return }

      // Solo procesamos transcripciones (ignoramos SpeechStarted, UtteranceEnd, etc.)
      if (data.type !== 'Results') return

      const alt        = data.channel?.alternatives?.[0]
      const texto      = alt?.transcript?.trim()
      const idioma     = alt?.languages?.[0] || 'en'
      const confidence = alt?.confidence ?? 0

      // Filtramos texto vacío o de muy baja confianza
      if (!texto || texto.length < 2) return

      // Para interim: solo mostramos si la confianza es aceptable
      // Para final: siempre mostramos (Deepgram ya filtró lo irrelevante)
      if (!data.is_final && confidence < 0.65) return

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
