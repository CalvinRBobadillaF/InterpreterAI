/**
 * App.jsx  —  Interpreter AI
 *
 * FLUJO DE DATOS:
 *   Audio  →  useTranscription  →  englishText / spanishText
 *                                       ↓
 *                              useAutoTranslation
 *                                       ↓
 *                            enToEs / esToEn (traducción)
 *                                       ↓
 *                            <TranslationPanel />
 */

import { useState, useRef, useCallback } from 'react'
import './App.css'

import { LogIn }            from './components/LogIn'
import { Header }           from './components/Header'
import { Footer }           from './components/Footer'
import { TranslationPanel } from './components/TranslationPanel'
import { useTranscription } from './hooks/useTranscription'
import { useAutoTranslation } from './hooks/useTranslation'
import { startElectronCapture } from './client/startElectronCapture'
import { startBrowserCapture }  from './client/startBrowserCapture'


function App() {

  // ── Autenticación ────────────────────────────────────────────
  // El usuario está logueado si tiene tanto el API key como el nombre guardados
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem('app_key') && !!localStorage.getItem('app_name')
  )

  // ── Estado de reproducción / fuente de audio ─────────────────
  const [playing, setPlaying] = useState(false)
  const [source,  setSource]  = useState('mic') // 'mic' | 'electron' | 'tab'

  // ── Texto confirmado (oraciones completas de Deepgram) ────────
  const [englishText, setEnglishText] = useState('')
  const [spanishText, setSpanishText] = useState('')

  // ── Texto provisional (mientras el usuario habla, aún no confirmado) ──
  const [interimEnglish, setInterimEnglish] = useState('')
  const [interimSpanish, setInterimSpanish] = useState('')

  // ── Estado del footer ─────────────────────────────────────────
  const [footerStatus, setFooterStatus] = useState('Idle')
  const [footerError,  setFooterError]  = useState(null)

  // Referencia al stream de audio activo (para poder cerrarlo al detener)
  const streamRef = useRef(null)


  // ── Limpiar paneles individualmente ──────────────────────────
  const handleClearLeft  = () => { setEnglishText(''); setInterimEnglish('') }
  const handleClearRight = () => { setSpanishText(''); setInterimSpanish('') }


  // ── Traducción automática ─────────────────────────────────────
  // Cada hook traduce solo los segmentos NUEVOS (no re-traduce todo el buffer)
  const { translatedText: enToEs } = useAutoTranslation(englishText, {
    from: 'en', to: 'es', debounceMs: 300,
  })

  const { translatedText: esToEn } = useAutoTranslation(spanishText, {
    from: 'es', to: 'en', debounceMs: 300,
  })


  // ── Transcripción en tiempo real ──────────────────────────────
  const { start: startTranscription, stop: stopTranscription, error: transcriptionError } =
    useTranscription({
      lang: 'multi', // Deepgram detecta EN y ES simultáneamente

      // onFinal: oración completa confirmada → se agrega al buffer
      onFinal: useCallback(({ text, lang }) => {
        // Decide el separador: si la oración anterior termina con puntuación
        // usamos doble salto (nueva burbuja), si no, concatenamos con espacio
        const agregar = (previo, nuevo) => {
          if (!previo) return nuevo
          const tienePuntuacion = /[.!?]$/.test(previo.trim())
          return previo.trim() + (tienePuntuacion ? '\n\n' : ' ') + nuevo.trim()
        }

        if (lang.startsWith('en')) {
          setInterimEnglish('')
          setEnglishText(prev => agregar(prev, text))
        } else if (lang.startsWith('es')) {
          setInterimSpanish('')
          setSpanishText(prev => agregar(prev, text))
        }
      }, []),

      // onInterim: texto en progreso → se muestra en la burbuja parpadeante
      onInterim: useCallback(({ text, lang }) => {
        if (lang.startsWith('en')) setInterimEnglish(text)
        else if (lang.startsWith('es')) setInterimSpanish(text)
      }, []),

      onError: useCallback((err) => {
        setFooterError(err)
        setPlaying(false)
        setFooterStatus('Idle')
      }, []),
    })


  // ── Play / Stop ───────────────────────────────────────────────
  const handleTogglePlay = useCallback(async () => {
    if (!playing) {
      setFooterError(null)
      let stream = null

      // Obtenemos el stream según la fuente seleccionada
      if (source === 'electron') {
        stream = await startElectronCapture()
        if (!stream) { setFooterError('No se pudo capturar el audio del sistema.'); return }
        setFooterStatus('Audio del sistema — Escuchando...')

      } else if (source === 'tab') {
        const resultado = await startBrowserCapture()
        if (!resultado.stream) {
          setFooterError(resultado.userMessage || 'Captura de pestaña cancelada.')
          return
        }
        stream = resultado.stream
        setFooterStatus('Audio de pestaña — Escuchando...')

      } else {
        // Micrófono: pedimos acceso directamente
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        setFooterStatus('Micrófono — Escuchando...')
      }

      streamRef.current = stream
      await startTranscription(stream)
      setPlaying(true)

    } else {
      // Detenemos todo y limpiamos el estado
      stopTranscription()
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setInterimEnglish('')
      setInterimSpanish('')
      setPlaying(false)
      setFooterStatus('Idle')
    }
  }, [playing, source, startTranscription, stopTranscription])


  // Solo permite cambiar la fuente cuando no está grabando
  const handleSourceChange = useCallback((s) => {
    if (!playing) setSource(s)
  }, [playing])


  // ── Render ────────────────────────────────────────────────────
  // Si no está logueado, mostramos la pantalla de login
  if (!isLoggedIn) {
    return <LogIn onLogin={() => setIsLoggedIn(true)} />
  }

  return (
    <div className="app-shell">
      <Header
        playing={playing}
        onTogglePlay={handleTogglePlay}
        source={source}
        onSourceChange={handleSourceChange}
      />

      <main className="app-main">
        {/* Panel izquierdo: transcribe inglés, traduce a español */}
        <TranslationPanel
          fromLang="EN"
          toLang="ES"
          placeholder={playing ? 'Escuchando...' : 'Presiona ▶ para comenzar'}
          value={englishText}
          translated={enToEs}
          interimText={interimEnglish}
          onChange={(e) => setEnglishText(e.target.value)}
          onClear={handleClearLeft}
        />

        {/* Panel derecho: transcribe español, traduce a inglés */}
        <TranslationPanel
          fromLang="ES"
          toLang="EN"
          readOnly
          value={spanishText}
          translated={esToEn}
          interimText={interimSpanish}
          onClear={handleClearRight}
        />
      </main>

      <Footer
        status={footerStatus}
        error={footerError || (transcriptionError ? `STT: ${transcriptionError}` : null)}
      />
    </div>
  )
}

export default App
