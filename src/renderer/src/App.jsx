/**
 * App.jsx  —  Interpreter AI
 *
 * NUEVO:
 *   subtitleOnly — cuando está activo, useAutoTranslation no se ejecuta
 *   y TranslationPanel recibe translated='' (no muestra sección de traducción).
 *   Esto evita todas las llamadas al backend cuando el usuario solo quiere subtítulos.
 */

import { useState, useRef, useCallback } from 'react'
import './App.css'

import { LogIn }              from './components/LogIn'
import { Header }             from './components/Header'
import { Footer }             from './components/Footer'
import { TranslationPanel }   from './components/TranslationPanel'
import { useTranscription }   from './hooks/useTranscription'
import { useAutoTranslation } from './hooks/useTranslation'
import { startElectronCapture } from './client/startElectronCapture'
import { startBrowserCapture }  from './client/startBrowserCapture'


function App() {

  // ── Autenticación ─────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem('app_key') && !!localStorage.getItem('app_name')
  )

  // ── Grabación y fuente de audio ───────────────────────────────
  const [playing, setPlaying] = useState(false)
  const [source,  setSource]  = useState('mic')

  // ── Modo: solo subtítulos (sin traducción) ────────────────────
  // Cuando está activo, no se hacen llamadas al backend de traducción
  const [subtitleOnly, setSubtitleOnly] = useState(false)

  // ── Texto transcrito (confirmado e interim) ───────────────────
  const [englishText,    setEnglishText]    = useState('')
  const [spanishText,    setSpanishText]    = useState('')
  const [interimEnglish, setInterimEnglish] = useState('')
  const [interimSpanish, setInterimSpanish] = useState('')

  // ── Footer ────────────────────────────────────────────────────
  const [footerStatus, setFooterStatus] = useState('Idle')
  const [footerError,  setFooterError]  = useState(null)

  const streamRef = useRef(null)

  // ── Limpiar paneles ───────────────────────────────────────────
  const handleClearLeft  = () => { setEnglishText('');  setInterimEnglish('') }
  const handleClearRight = () => { setSpanishText('');  setInterimSpanish('') }

  // ── Traducción automática ─────────────────────────────────────
  // Solo se activa si subtitleOnly === false.
  // Pasamos '' si está en modo subtítulos → no se dispara ningún fetch.
  const textoParaTraducirEN = subtitleOnly ? '' : englishText
  const textoParaTraducirES = subtitleOnly ? '' : spanishText

  const { translatedText: enToEs, translating: traduciendoEN } =
    useAutoTranslation(textoParaTraducirEN, { from: 'en', to: 'es', debounceMs: 300 })

  const { translatedText: esToEn, translating: traduciendoES } =
    useAutoTranslation(textoParaTraducirES, { from: 'es', to: 'en', debounceMs: 300 })

  // ── Transcripción en tiempo real ──────────────────────────────
  const { start: startTranscription, stop: stopTranscription, error: transcriptionError } =
    useTranscription({
      lang: 'multi', // Deepgram detecta EN + ES al mismo tiempo

      onFinal: useCallback(({ text, lang }) => {
        // Separador: doble salto (nueva burbuja) si termina con puntuación,
        // espacio simple si la oración continúa sin pausa
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

      onInterim: useCallback(({ text, lang }) => {
        if (lang.startsWith('en'))      setInterimEnglish(text)
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
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        setFooterStatus('Micrófono — Escuchando...')
      }

      streamRef.current = stream
      await startTranscription(stream)
      setPlaying(true)

    } else {
      stopTranscription()
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setInterimEnglish('')
      setInterimSpanish('')
      setPlaying(false)
      setFooterStatus('Idle')
    }
  }, [playing, source, startTranscription, stopTranscription])

  const handleSourceChange = useCallback((s) => {
    if (!playing) setSource(s)
  }, [playing])


  // ── Render ────────────────────────────────────────────────────
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
        subtitleOnly={subtitleOnly}
        onToggleSubtitleOnly={() => setSubtitleOnly(v => !v)}
      />

      <main className="app-main">
        {/* Panel izquierdo: EN original → traducción ES */}
        <TranslationPanel
          fromLang="EN"
          toLang="ES"
          placeholder={playing ? 'Escuchando...' : 'Presiona ▶ para comenzar'}
          value={englishText}
          translated={enToEs}           // vacío en modo solo subtítulos
          interimText={interimEnglish}
          loading={traduciendoEN}
          onChange={(e) => setEnglishText(e.target.value)}
          onClear={handleClearLeft}
          subtitleOnly={subtitleOnly}   // oculta la sección de traducción
        />

        {/* Panel derecho: ES original → traducción EN */}
        <TranslationPanel
          fromLang="ES"
          toLang="EN"
          readOnly
          value={spanishText}
          translated={esToEn}           // vacío en modo solo subtítulos
          interimText={interimSpanish}
          loading={traduciendoES}
          onClear={handleClearRight}
          subtitleOnly={subtitleOnly}
        />
      </main>

      <Footer
        status={subtitleOnly ? `${footerStatus} · Solo subtítulos` : footerStatus}
        error={footerError || (transcriptionError ? `STT: ${transcriptionError}` : null)}
      />
    </div>
  )
}

export default App
