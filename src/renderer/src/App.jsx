import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import './App.css'

import { LogIn }             from './components/LogIn'
import { Header }            from './components/Header'
import { Footer }            from './components/Footer'
import { ConversationView }  from './components/ConversationView'
import { useTranscription }  from './hooks/useTranscription'
import { translateText, prewarmTranslation } from './hooks/useTranslation'
import { startBrowserCapture }  from './client/startBrowserCapture'
import { startElectronCapture } from './client/startElectronCapture'
import { isElectron }           from './hooks/isElectron'

let _uid = 0
const uid = () => `u${++_uid}`

const MERGE_WINDOW_MS     = 250
const TERMINAL_PUNCT      = /[.!?…]$/
const PREWARM_DEBOUNCE_MS = 100
const HT_MODE_STORAGE_KEY = 'ht_mode' // NUEVO: persiste tu elección entre sesiones

function normLang(lang = '') {
  return lang.slice(0, 2).toLowerCase() || 'en'
}

const TRANSLATION_CONTEXT = null

function getTargetLang(sourceLang, htMode) {
  if (htMode) return 'ht'
  return sourceLang === 'en' ? 'es' : 'en'
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => !!localStorage.getItem('app_key')?.trim() && !!localStorage.getItem('app_name')
  )
  const handleLogout = useCallback(() => {
    localStorage.removeItem('app_key')
    localStorage.removeItem('app_name')
    setIsLoggedIn(false)
  }, [])

  const [playing, setPlaying] = useState(false)
  const [source,  setSource]  = useState('mic')
  const streamRef    = useRef(null)
  const abortCtrlRef = useRef(null)

  const [subtitleOnly, setSubtitleOnly] = useState(false)
  const subtitleOnlyRef = useRef(false)
  subtitleOnlyRef.current = subtitleOnly

  // NUEVO: htMode ahora se lee/guarda en localStorage — ya no se resetea
  // a "true" cada vez que recargas la página. Primera vez (sin nada
  // guardado todavía) sigue arrancando en modo Kreyòl por defecto.
  const [htMode, setHtMode] = useState(
    () => localStorage.getItem(HT_MODE_STORAGE_KEY) !== 'false'
  )
  const htModeRef = useRef(htMode)
  htModeRef.current = htMode

  const handleToggleHtMode = useCallback(() => {
    setHtMode(prev => {
      const next = !prev
      localStorage.setItem(HT_MODE_STORAGE_KEY, String(next))
      return next
    })
  }, [])

  const [utterances,  setUtterances]  = useState([])
  const [interimText, setInterimText] = useState('')
  const [interimLang, setInterimLang] = useState('en')

  const lastFinalTimeRef = useRef(0)
  const lastUtteranceRef = useRef(null)
  const prewarmTimerRef  = useRef(null)

  const [footerError, setFooterError] = useState(null)
  const footerStatus = useMemo(() => {
    const modeLabel = htMode ? 'EN/ES → 🇭🇹 Kreyòl' : 'EN ⇄ ES'
    if (!playing) return `Idle — ${modeLabel}`
    const label =
      source === 'system' ? '🖥️ System Audio' :
      source === 'tab'    ? '🌐 Browser Tab'  :
                            '🎙️ Microphone'
    return subtitleOnly
      ? `${label} — Subtitles only`
      : `${label} — ${modeLabel}`
  }, [playing, subtitleOnly, source, htMode])

  const handleClear = useCallback(() => {
    setUtterances([])
    setInterimText('')
    lastFinalTimeRef.current = 0
    lastUtteranceRef.current = null
  }, [])

  // ── Retry traducción fallida ────────────────────────────────────────
  const handleRetryTranslation = useCallback(async (id) => {
    let targetUtterance = null

    setUtterances(prev => {
      targetUtterance = prev.find(u => u.id === id) ?? null
      return prev.map(u =>
        u.id === id && u.failed
          ? { ...u, translating: true, failed: false }
          : u
      )
    })

    await new Promise(r => setTimeout(r, 0))
    if (!targetUtterance) return

    const targetLang = getTargetLang(targetUtterance.lang, htModeRef.current)
    let translation = null
    try {
      translation = await translateText({
        text:    targetUtterance.text,
        from:    targetUtterance.lang,
        to:      targetLang,
        context: TRANSLATION_CONTEXT,
        signal:  abortCtrlRef.current?.signal ?? null,
      })
    } catch { /* silencioso */ }

    setUtterances(prev => prev.map(u =>
      u.id === id
        ? { ...u, translation, translating: false, failed: !translation }
        : u
    ))
  }, [])

  // ── handleFinal ───────────────────────────────────────────────────────
  const handleFinal = useCallback(async ({ text, lang, speechFinal }) => {
    setInterimText('')
    if (prewarmTimerRef.current) {
      clearTimeout(prewarmTimerRef.current)
      prewarmTimerRef.current = null
    }

    const now        = Date.now()
    const l          = normLang(lang)
    const targetLang = getTargetLang(l, htModeRef.current)
    const isSubOnly  = subtitleOnlyRef.current
    const endsWithP  = TERMINAL_PUNCT.test(text)
    const signal     = abortCtrlRef.current?.signal ?? null

    const prev = lastUtteranceRef.current
    const withinWindow = (now - lastFinalTimeRef.current) < MERGE_WINDOW_MS
    const shouldMerge  = (
      prev                &&
      withinWindow        &&
      prev.lang === l     &&
      !prev.endsWithPunct &&
      !speechFinal
    )

    lastFinalTimeRef.current = now

    if (shouldMerge) {
      const mergedText = prev.text + ' ' + text

      lastUtteranceRef.current = {
        id: prev.id, text: mergedText, lang: l,
        endsWithPunct: TERMINAL_PUNCT.test(mergedText),
      }

      setUtterances(utt => utt.map(u =>
        u.id === prev.id
          ? { ...u, text: mergedText, translation: null, translating: !isSubOnly, failed: false }
          : u
      ))

      if (!isSubOnly) {
        let translation = null
        try {
          translation = await translateText({
            text: mergedText, from: l, to: targetLang,
            context: TRANSLATION_CONTEXT, signal,
          })
        } catch { /* silencioso */ }

        if (signal?.aborted) return

        setUtterances(utt => utt.map(u =>
          u.id === prev.id
            ? { ...u, translation, translating: false, failed: !translation }
            : u
        ))
      }
      return
    }

    const id        = uid()
    const timestamp = new Date()

    lastUtteranceRef.current = { id, text, lang: l, endsWithPunct: endsWithP }

    setUtterances(prev => [
      ...prev,
      { id, text, lang: l, translation: null, translating: !isSubOnly, failed: false, timestamp },
    ])

    if (isSubOnly) return

    let translation = null
    try {
      translation = await translateText({
        text, from: l, to: targetLang,
        context: TRANSLATION_CONTEXT, signal,
      })
    } catch { /* silencioso */ }

    if (signal?.aborted) return

    setUtterances(utt => utt.map(u =>
      u.id === id
        ? { ...u, translation, translating: false, failed: !translation }
        : u
    ))
  }, [])

  // ── handleInterim ─────────────────────────────────────────────────────
  const handleInterim = useCallback(({ text, lang }) => {
    setInterimText(text)
    const l = normLang(lang)
    setInterimLang(l)

    if (subtitleOnlyRef.current) return

    const targetLang = getTargetLang(l, htModeRef.current)

    if (prewarmTimerRef.current) clearTimeout(prewarmTimerRef.current)
    prewarmTimerRef.current = setTimeout(() => {
      prewarmTranslation({ text, from: l, to: targetLang })
      prewarmTimerRef.current = null
    }, PREWARM_DEBOUNCE_MS)
  }, [])

  const handleTranscriptionError = useCallback((err) => {
    setFooterError(err)
    setPlaying(false)
  }, [])

  const {
    start: startTranscription,
    stop:  stopTranscription,
    error: transcriptionError,
  } = useTranscription({
    onFinal:   handleFinal,
    onInterim: handleInterim,
    onError:   handleTranscriptionError,
  })

  useEffect(() => {
    return () => {
      abortCtrlRef.current?.abort()
      if (prewarmTimerRef.current) clearTimeout(prewarmTimerRef.current)
    }
  }, [])

  const getAudioStream = useCallback(async () => {
    if (source === 'mic') {
      return navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl:  true,
          noiseSuppression: true,
          echoCancellation: true,
          sampleRate:       16000,
        },
        video: false,
      })
    }
    if (source === 'system') {
      if (!isElectron()) {
        throw new Error('System audio capture is only available in the desktop app.')
      }
      const { stream, userMessage } = await startElectronCapture()
      if (!stream) throw new Error(userMessage || 'Could not capture system audio.')
      return stream
    }
    if (source === 'tab') {
      const r = await startBrowserCapture()
      if (!r.stream) throw new Error(r.userMessage || 'Tab capture cancelled.')
      return r.stream
    }
    throw new Error(`Unknown audio source: "${source}"`)
  }, [source])

  // ── Atajo de teclado: Barra espaciadora = Play/Stop ────────────────────
  // NUEVO. Se ignora si el foco está en un input/textarea/botón (para no
  // interferir con el login u otros controles), y si se está escribiendo
  // en cualquier campo editable.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== 'Space') return
      const tag = e.target?.tagName
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable
      if (isEditable) return
      e.preventDefault()
      handleTogglePlayRef.current?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleTogglePlayRef = useRef(null)

  const handleTogglePlay = useCallback(async () => {
    if (!playing) {
      setFooterError(null)

      abortCtrlRef.current?.abort()
      abortCtrlRef.current = new AbortController()

      let stream
      try {
        stream = await getAudioStream()
      } catch (err) {
        setFooterError(err.message)
        return
      }
      try {
        await startTranscription(stream)
        streamRef.current = stream
        setPlaying(true)
      } catch (err) {
        stream.getTracks().forEach(t => t.stop())
        setFooterError(err.message || 'Error starting transcription')
      }
    } else {
      abortCtrlRef.current?.abort()
      abortCtrlRef.current = null

      if (prewarmTimerRef.current) {
        clearTimeout(prewarmTimerRef.current)
        prewarmTimerRef.current = null
      }

      stopTranscription()
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setInterimText('')
      setPlaying(false)
    }
  }, [playing, getAudioStream, startTranscription, stopTranscription])

  handleTogglePlayRef.current = handleTogglePlay

  if (!isLoggedIn) return <LogIn onLogin={() => setIsLoggedIn(true)} />

  return (
    <div className="app-shell">
      <Header
        playing={playing}
        onTogglePlay={handleTogglePlay}
        source={source}
        onSourceChange={(s) => { if (!playing) setSource(s) }}
        subtitleOnly={subtitleOnly}
        onToggleSubtitleOnly={() => setSubtitleOnly(p => !p)}
        onLogout={handleLogout}
        htMode={htMode}
        onToggleHtMode={() => { if (!playing) handleToggleHtMode() }}
      />
      <main className="app-main">
        <ConversationView
          utterances={utterances}
          interimText={interimText}
          interimLang={interimLang}
          subtitleOnly={subtitleOnly}
          htMode={htMode}
          playing={playing}
          onClear={handleClear}
          onRetry={handleRetryTranslation}
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
