/**
 * App.jsx — Interpreter AI
 * ─────────────────────────────────────────────────────────────────
 * AUDIO PIPELINE (with Deepgram):
 *
 *  [mic]      → getUserMedia()         → stream → Deepgram WS → transcription
 *  [electron] → desktopCapturer stream → stream → Deepgram WS → transcription
 *  [tab]      → getDisplayMedia stream → stream → Deepgram WS → transcription
 *
 * Each mode feeds the same MediaStream into useTranscription.start(stream).
 * Deepgram handles the audio regardless of its source.
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useCallback } from 'react'
import './App.css'
import { LogIn } from './components/LogIn'
import { Header }           from './components/Header'
import { Footer }           from './components/Footer'
import { TranslationPanel } from './components/TranslationPanel'
import { useTranscription } from './hooks/useTranscription'
import { useAutoTranslation } from './hooks/useTranslation'
import { startElectronCapture } from './client/startElectronCapture'
import { startBrowserCapture }  from './client/startBrowserCapture'

function App() {
    // 🔥 Nuevo estado de autenticación (verifica si ya hay datos guardados)
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem('app_key') && !!localStorage.getItem('app_name')
  )

  const [playing, setPlaying] = useState(false)
  const [source, setSource]   = useState('mic')

  // 🔥 TEXTO FINAL
  const [englishText, setEnglishText] = useState('')
  const [spanishText, setSpanishText] = useState('')

  // 🔥 INTERIM (LIVE)
  const [interimEnglish, setInterimEnglish] = useState('')
  const [interimSpanish, setInterimSpanish] = useState('')

  const [footerStatus, setFooterStatus] = useState('Idle')
  const [footerError, setFooterError]   = useState(null)





  const ACTIVE_LEFT_LANG = 'en'
  const ACTIVE_RIGHT_LANG = 'es'

  const streamRef = useRef(null)

  // 🧹 CLEAR
  const handleClearLeft = () => {
    setEnglishText('')
    setInterimEnglish('')
  }

  const handleClearRight = () => {
    setSpanishText('')
    setInterimSpanish('')
  }

  // ── Translation EN → ES
  const { translatedText: enToEs } = useAutoTranslation(englishText, {
    from: 'en',
    to: 'es',
    debounceMs: 500,
  })

  // ── Translation ES → EN
  const { translatedText: esToEn } = useAutoTranslation(spanishText, {
    from: 'es',
    to: 'en',
    debounceMs: 500,
  })

  // ── Transcription
  const {
    start: startTranscription,
    stop: stopTranscription,
    error: transcriptionError
  } = useTranscription({
    lang: 'multi',

    onFinal: useCallback(({ text, lang }) => {
      // ✅ Usar startsWith previene fallos si llega "en-US" o "es-ES"
      if (lang.startsWith('en')) {
        setInterimEnglish('')
        setEnglishText(prev => (prev ? prev + ' ' : '') + text)
      }

      if (lang.startsWith('es')) {
        setInterimSpanish('')
        setSpanishText(prev => (prev ? prev + ' ' : '') + text)
      }
    }, []),

    onInterim: useCallback(({ text, lang }) => {
      if (lang.startsWith('en')) {
        setInterimEnglish(text)
      }

      if (lang.startsWith('es')) {
        setInterimSpanish(text)
      }
    }, []),


    onError: useCallback((err) => {
      setFooterError(err)
      setPlaying(false)
      setFooterStatus('Idle')
    }, []),
  })

  // ── Play / Stop
  const handleTogglePlay = useCallback(async () => {

  console.log('1️⃣ CLICK')

  if (!playing) {
    setFooterError(null)

    let stream = null

    // 🔥 USA TU STATE, NO IPC AQUÍ
    if (source === 'electron') {

      console.log('🖥 SYSTEM AUDIO MODE')

      stream = await startElectronCapture()

      if (!stream) {
        setFooterError('Could not capture system audio.')
        return
      }

      setFooterStatus('System Audio — Listening...')

    } else if (source === 'tab') {

      console.log('🌐 TAB AUDIO MODE')

      stream = await startBrowserCapture()

      if (!stream) {
        setFooterError('Tab capture cancelled.')
        return
      }

      setFooterStatus('Tab Audio — Listening...')

    } else {

      console.log('🎤 MIC MODE')

      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      })

      setFooterStatus('Microphone — Listening...')
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

        {/* 🔹 LEFT PANEL (EN → ES) */}
        <TranslationPanel
          fromLang="EN"
          toLang="ES"
          placeholder={playing ? 'Listening...' : 'Press ▶ to start'}
          value={englishText}
          translated={enToEs}
          interimText={interimEnglish}
          onChange={(e) => setEnglishText(e.target.value)}
          onClear={handleClearLeft}
        />

        {/* 🔹 RIGHT PANEL (ES → EN) */}
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