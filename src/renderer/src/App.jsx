import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import './App.css'

import { LogIn }             from './components/LogIn'
import { Header }            from './components/Header'
import { Footer }            from './components/Footer'
import { ConversationView }  from './components/ConversationView'
import { KreyolGlossary } from './components/KreyolGlossary'
import { useTranscription }        from './hooks/useTranscription'        // Deepgram: EN/ES
import { useGladiaTranscription }  from './hooks/useGladiaTranscription'  // Gladia: Kreyòl
import { translateText, prewarmTranslation } from './hooks/useTranslation' // misma ruta para TODAS las traducciones
import { startBrowserCapture }  from './client/startBrowserCapture'
import { startElectronCapture } from './client/startElectronCapture'
import { isElectron }           from './hooks/isElectron'

let _uid = 0
const uid = () => `u${++_uid}`

const MERGE_WINDOW_MS      = 250
const TERMINAL_PUNCT       = /[.!?…]$/
const PREWARM_DEBOUNCE_MS  = 100
const HT_MODE_STORAGE_KEY  = 'ht_mode'

function normLang(lang = '') {
  return lang.slice(0, 2).toLowerCase() || 'en'
}

// A qué idioma se traduce cada utterance, según quién habló y los modos:
//   - Habló en Kreyòl → se traduce al ÚLTIMO idioma no-Kreyòl que se usó
//     (adaptativo: si el otro lado viene en español, criollo→español;
//     si viene en inglés, criollo→inglés — sin elegir manualmente)
//   - Habló en inglés/español → Kreyòl si htMode está activo, si no,
//     el otro de los dos (bilingüe de siempre)
function pickDisplayTargetLang(sourceLang, htMode, lastNonHtLang) {
  if (sourceLang === 'ht') return lastNonHtLang || 'en'
  if (htMode) return 'ht'
  return sourceLang === 'en' ? 'es' : 'en'
}

function App() {
  // ── Auth ──────────────────────────────────────────────────────────────
  // Deepgram vuelve a ser la key requerida (EN/ES nunca falló). Gladia es
  // opcional — solo hace falta si usas el botón de captura en Kreyòl.
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => !!localStorage.getItem('app_key')?.trim() && !!localStorage.getItem('app_name')
  )
  const handleLogout = useCallback(() => {
    localStorage.removeItem('app_key')
    localStorage.removeItem('app_name')
    setIsLoggedIn(false)
  }, [])

  // ── Playback ───────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false)
  const [source,  setSource]  = useState('mic')
  const streamRef    = useRef(null)
  const abortCtrlRef = useRef(null)

  // ── ¿Quién está por hablar? — decide qué pipeline arranca el Play ──────
  const [captureKreyol, setCaptureKreyol] = useState(false)
  const captureKreyolRef = useRef(false)
  captureKreyolRef.current = captureKreyol

  // ── htMode: a qué traducir el habla en EN/ES (solo aplica si NO estás
  // capturando Kreyòl — cuando hablan en Kreyòl, el destino es adaptativo) ─
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

  const [subtitleOnly, setSubtitleOnly] = useState(false)
  const [isGlossaryOpen, setIsGlossaryOpen] = useState(false)
  const subtitleOnlyRef = useRef(false)
  subtitleOnlyRef.current = subtitleOnly

  const [utterances,  setUtterances]  = useState([])
  const [interimText, setInterimText] = useState('')
  const [interimLang, setInterimLang] = useState('en')

  const lastFinalTimeRef = useRef(0)
  const lastUtteranceRef = useRef(null)
  const prewarmTimerRef  = useRef(null)
  // Último idioma NO-Kreyòl hablado — decide a qué traducir cuando llega Kreyòl
  const lastNonHtLangRef = useRef('en')

  const [footerError, setFooterError] = useState(null)
  const footerStatus = useMemo(() => {
    const modeLabel = captureKreyol
      ? '🇭🇹 Capturando Kreyòl (Gladia)'
      : (htMode ? 'EN/ES → 🇭🇹 Kreyòl' : 'EN ⇄ ES')
    if (!playing) return `Idle — ${modeLabel}`
    const label =
      source === 'system' ? '🖥️ System Audio' :
      source === 'tab'    ? '🌐 Browser Tab'  :
                            '🎙️ Microphone'
    return subtitleOnly
      ? `${label} — Subtitles only`
      : `${label} — ${modeLabel}`
  }, [playing, subtitleOnly, source, htMode, captureKreyol])

  const handleClear = useCallback(() => {
    setUtterances([])
    setInterimText('')
    lastFinalTimeRef.current = 0
    lastUtteranceRef.current = null
  }, [])

  // ── Retry — misma ruta translateText() que usa el flujo automático ─────
  const handleRetryTranslation = useCallback(async (id) => {
    let targetUtterance = null

    setUtterances(prev => {
      targetUtterance = prev.find(u => u.id === id) ?? null
      return prev.map(u =>
        u.id === id && u.failed ? { ...u, translating: true, failed: false } : u
      )
    })

    await new Promise(r => setTimeout(r, 0))
    if (!targetUtterance) return

    let translation = null
    try {
      translation = await translateText({
        text:   targetUtterance.text,
        from:   targetUtterance.lang,
        to:     targetUtterance.targetLang,
        signal: abortCtrlRef.current?.signal ?? null,
      })
    } catch { /* silencioso */ }

    setUtterances(prev => prev.map(u =>
      u.id === id ? { ...u, translation, translating: false, failed: !translation } : u
    ))
  }, [])

  // ── handleFinal — COMPARTIDO por Deepgram (en/es) y Gladia (ht) ─────────
  // Ambos pipelines llaman esto igual: {text, lang, speechFinal}. La
  // traducción SIEMPRE pasa por translateText() — la misma ruta probada
  // que usa "Retry" — nunca depende de una traducción en vivo del propio
  // proveedor de STT.
  const handleFinal = useCallback(async ({ text, lang, speechFinal }) => {
    setInterimText('')
    if (prewarmTimerRef.current) {
      clearTimeout(prewarmTimerRef.current)
      prewarmTimerRef.current = null
    }

    const now = Date.now()
    const l   = normLang(lang)
    if (l !== 'ht') lastNonHtLangRef.current = l

    const targetLang = pickDisplayTargetLang(l, htModeRef.current, lastNonHtLangRef.current)
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
          translation = await translateText({ text: mergedText, from: l, to: targetLang, signal })
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
      { id, text, lang: l, targetLang, translation: null, translating: !isSubOnly, failed: false, timestamp },
    ])

    if (isSubOnly) return

    let translation = null
    try {
      translation = await translateText({ text, from: l, to: targetLang, signal })
    } catch { /* silencioso */ }

    if (signal?.aborted) return

    setUtterances(utt => utt.map(u =>
      u.id === id ? { ...u, translation, translating: false, failed: !translation } : u
    ))
  }, [])

  // ── handleInterim — compartido también ──────────────────────────────────
  const handleInterim = useCallback(({ text, lang }) => {
    setInterimText(text)
    const l = normLang(lang)
    setInterimLang(l)

    if (subtitleOnlyRef.current) return

    const targetLang = pickDisplayTargetLang(l, htModeRef.current, lastNonHtLangRef.current)

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

  // ── Los dos pipelines de STT — siempre instanciados, solo uno se usa ────
  const {
    start: startDeepgram,
    stop:  stopDeepgram,
    error: deepgramError,
  } = useTranscription({
    onFinal:   handleFinal,
    onInterim: handleInterim,
    onError:   handleTranscriptionError,
  })

  const {
    start: startGladia,
    stop:  stopGladia,
    error: gladiaError,
  } = useGladiaTranscription({
    onFinal:   handleFinal,
    onInterim: handleInterim,
    onError:   handleTranscriptionError,
  })

  // A provider can fail after its socket opened. Stop the browser capture too;
  // otherwise its audio track keeps running even though the UI says "Idle".
  useEffect(() => {
    if (!deepgramError && !gladiaError) return
    abortCtrlRef.current?.abort()
    abortCtrlRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }, [deepgramError, gladiaError])

  useEffect(() => {
    return () => {
      abortCtrlRef.current?.abort()
      if (prewarmTimerRef.current) clearTimeout(prewarmTimerRef.current)
    }
  }, [])

  // ── Audio stream ───────────────────────────────────────────────────────
  const handleTogglePlayRef = useRef(null)
  const playingRef = useRef(false)
  playingRef.current = playing

  const getAudioStream = useCallback(async () => {
    if (source === 'mic') {
      return navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: true, noiseSuppression: true, echoCancellation: true },
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
      const r = await startBrowserCapture({
        onTrackEnded: () => {
          if (playingRef.current) handleTogglePlayRef.current?.()
        },
      })
      if (!r.stream) throw new Error(r.userMessage || 'Tab capture cancelled.')
      return r.stream
    }
    throw new Error(`Unknown audio source: "${source}"`)
  }, [source])

  // ── Atajo de teclado: Barra espaciadora = Play/Stop ─────────────────────
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

  // ── Play / Stop ────────────────────────────────────────────────────────
  const handleTogglePlay = useCallback(async () => {
    if (!playing) {
      setFooterError(null)
      lastFinalTimeRef.current = 0
      lastUtteranceRef.current = null

      abortCtrlRef.current?.abort()
      abortCtrlRef.current = new AbortController()

      let stream
      try {
        stream = await getAudioStream()
      } catch (err) {
        setFooterError(err.message)
        return
      }

      const useGladia = captureKreyolRef.current

      try {
        const started = useGladia
          ? await startGladia(stream)
          : await startDeepgram(stream)
        if (!started) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
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

      // Detenemos AMBOS por seguridad — el que no estaba activo, no hace nada.
      stopDeepgram()
      stopGladia()

      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setInterimText('')
      lastFinalTimeRef.current = 0
      lastUtteranceRef.current = null
      setPlaying(false)
    }
  }, [playing, getAudioStream, startDeepgram, stopDeepgram, startGladia, stopGladia])

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
        captureKreyol={captureKreyol}
        onToggleCaptureKreyol={() => { if (!playing) setCaptureKreyol(p => !p) }}
        onOpenGlossary={() => setIsGlossaryOpen(true)}
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
        error={footerError || (deepgramError ? `STT: ${deepgramError}` : gladiaError ? `STT: ${gladiaError}` : null)}
      />
      {isGlossaryOpen && <KreyolGlossary onClose={() => setIsGlossaryOpen(false)} />}
    </div>
  )
}

export default App
