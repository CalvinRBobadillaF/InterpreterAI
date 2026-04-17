/**
 * hooks/useTranscription.js  —  Transcripción en tiempo real con Deepgram
 *
 * MEJORAS DE PRECISIÓN (especialmente español):
 *
 *  1. utterance_end_ms=1200  
 *     Deepgram espera 1.2s de silencio antes de cerrar una utterance.
 *     Sin esto, el español con pausas naturales se corta en medio de oraciones.
 *     Antes solo existía endpointing=500 que no es lo mismo.
 *
 *  2. filler_words=false
 *     Evita que Deepgram incluya "eh", "um", "este" como texto confirmado,
 *     lo que contamina los subtítulos y confunde a la traducción.
 *
 *  3. no_delay=true
 *     Deepgram envía los resultados en cuanto están listos en vez de 
 *     agruparlos — reduce la latencia visual de los subtítulos.
 *
 *  4. Keywords bilingüe
 *     Lista con términos en inglés Y español ya que el modelo 'multi' 
 *     transcribe ambos idiomas. Prioridades ajustadas por frecuencia real.
 */

import { useCallback, useRef, useState } from 'react'

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen'

// Vocabulario especializado para intérpretes.
// Formato: 'palabra:N' donde N=1-5 es la prioridad (mayor = más forzado).
// Agrupa por industria para facilitar el mantenimiento.
const KEYWORDS = [
  // Emergencias / 911
  'CPR:3', 'RCP:3', 'dispatcher:2', 'paramedics:2', 'paramédicos:2',
  'unconscious:2', 'inconsciente:2', 'overdose:2', 'sobredosis:2',
  'intersection:2', 'intersección:2', 'felony:2', 'misdemeanor:2',

  // Médico
  'HIPAA:3', 'MRI:2', 'resonancia:2', 'referral:2', 'referimiento:2',
  'pediatrician:2', 'pediatra:2', 'prescription:2', 'receta:2',
  'blood pressure:2', 'presión arterial:2',

  // Seguros
  'out-of-pocket:3', 'deductible:2', 'deducible:2',
  'copay:2', 'copago:2', 'premium:2', 'prima:2',
  'claim:2', 'reclamo:2', 'adjuster:2', 'underwriting:2',

  // Finanzas / Bank of America
  'Bank of America:3', 'routing number:3', 'número de ruta:3',
  'account number:3', 'número de cuenta:3', 'wire transfer:2',
  'overdraft:2', 'sobregiro:2', 'Zelle:3', 'statement:2', 'estado de cuenta:2',
]


export function useTranscription({
  lang = 'multi',
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

    // Pedimos el micrófono si no recibimos un stream externo
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl:  true,   // amplifica voces bajas automáticamente
            noiseSuppression: false,  // no mutilar palabras por "ruido"
            echoCancellation: true,   // evitar retroalimentación
          }
        })
      } catch (e) {
        emitirError('Micrófono denegado: ' + e.message)
        return
      }
    }

    // ── Parámetros de Deepgram ──────────────────────────────────
    const params = new URLSearchParams({
      model:            'nova-2',
      language:         lang,          // 'multi' detecta EN + ES simultáneo
      smart_format:     'true',        // capitalización, números, puntuación
      interim_results:  'true',        // resultados en tiempo real mientras habla
      punctuate:        'true',        // agrega puntuación automática
      endpointing:      '400',         // ms de silencio para cortar una oración
      utterance_end_ms: '1200',        // ms de silencio para cerrar utterance completa
      filler_words:     'false',       // elimina "eh", "um", "este" del texto
      no_delay:         'true',        // envía resultados inmediatamente (menos latencia)
    })

    // Inyectamos el vocabulario especializado
    KEYWORDS.forEach(kw => params.append('keywords', kw))

    const ws = new WebSocket(`${DEEPGRAM_URL}?${params}`, ['token', API_KEY])
    socketRef.current = ws


    // ── WebSocket abierto ─────────────────────────────────────
    ws.onopen = () => {
      activoRef.current = true
      setActive(true)
      console.log('✅ Deepgram conectado — idioma:', lang)

      // Elegimos el mejor formato disponible
      // NO pasar encoding a Deepgram — él auto-detecta webm/opus
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data)
        }
      }

      recorder.start(200) // chunks de 200ms para mayor fluidez (antes 250ms)
      recorderRef.current = recorder
    }


    // ── Mensajes de Deepgram ──────────────────────────────────
    ws.onmessage = (msg) => {
      let data
      try { data = JSON.parse(msg.data) } catch { return }

      // Solo procesamos transcripciones (ignoramos metadatos, SpeechStarted, etc.)
      if (data.type !== 'Results') return

      const alt             = data.channel?.alternatives?.[0]
      const texto           = alt?.transcript?.trim()
      const idiomaDetectado = alt?.languages?.[0] || 'en'

      if (!texto) return

      const payload = { text: texto, lang: idiomaDetectado }

      if (data.is_final) {
        onFinal?.(payload)
      } else {
        onInterim?.(payload)
      }
    }


    ws.onerror = () => emitirError('Error de conexión con Deepgram')

    ws.onclose = (e) => {
      const razones = {
        1008: 'API key de Deepgram rechazado — verifica tu clave',
        1011: 'Error interno de Deepgram — intenta de nuevo',
      }
      if (razones[e.code]) emitirError(razones[e.code])
      console.log(`🔌 Deepgram cerrado — código: ${e.code}`)
      activoRef.current = false
      setActive(false)
    }

  }, [lang, onFinal, onInterim, emitirError])


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
