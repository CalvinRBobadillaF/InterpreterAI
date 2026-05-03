import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import './App.css'

import { LogIn }             from './components/LogIn'
import { Header }            from './components/Header'
import { Footer }            from './components/Footer'
import { ConversationView }  from './components/ConversationView'
import { useTranscription }  from './hooks/useTranscription'
import { translateText, prewarmTranslation } from './hooks/useTranslation'
import { startBrowserCapture } from './client/startBrowserCapture'

let _uid = 0
const uid = () => `u${++_uid}`

// ── Constantes ────────────────────────────────────────────────────────────
const MERGE_WINDOW_MS    = 250
const TERMINAL_PUNCT     = /[.!?…]$/
const PREWARM_DEBOUNCE_MS = 300

// ── Normalizar idioma detectado a 'en' | 'es' ────────────────────────────
// Deepgram devuelve variantes como 'en-US', 'es-419', 'es-ES', etc.
// Normalizamos a 2 letras para toda la lógica de la app.
function normLang(lang = '') {
  const p = lang.slice(0, 2).toLowerCase()
  return p === 'es' ? 'es' : 'en'
}

// ── Contexto de dominio opcional ──────────────────────────────────────────
// Si tu app se usa en un contexto específico (médico, legal, etc.),
// descomenta y adapta esta línea. El backend debe soportar el campo context.
// const TRANSLATION_CONTEXT = 'Medical interpretation between doctor and patient.'
const TRANSLATION_CONTEXT = null

function App() {
  // ── Auth ──────────────────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem('app_key')?.trim() && !!localStorage.getItem('app_name')
  )
  const handleLogout = useCallback(() => {
    localStorage.removeItem('app_key')
    localStorage.removeItem('app_name')
    setIsLoggedIn(false)
  }, [])

  // ── Playback ───────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false)
  const [source,  setSource]  = useState('mic')
  const streamRef = useRef(null)

  // ── Subtitle-only ──────────────────────────────────────────────────────
  const [subtitleOnly,    setSubtitleOnly]    = useState(false)
  const subtitleOnlyRef = useRef(false)
  subtitleOnlyRef.current = subtitleOnly

  // ── Conversation state ─────────────────────────────────────────────────
  // Cada utterance: { id, text, lang, translation, translating, failed, timestamp }
  // NUEVO: campo `failed` para mostrar UI de retry cuando la traducción falla
  const [utterances,  setUtterances]  = useState([])
  const [interimText, setInterimText] = useState('')
  const [interimLang, setInterimLang] = useState('en')

  const lastFinalTimeRef = useRef(0)
  const lastUtteranceRef = useRef(null)
  const prewarmTimerRef  = useRef(null)

  // ── Footer ─────────────────────────────────────────────────────────────
  const [footerError, setFooterError] = useState(null)
  const footerStatus = useMemo(() => {
    if (!playing) return 'Idle'
    return subtitleOnly ? '🎙️ Listening — Subtitles only' : '🎙️ Listening — Auto EN/ES'
  }, [playing, subtitleOnly])

  // ── Clear ──────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    setUtterances([])
    setInterimText('')
    lastFinalTimeRef.current = 0
    lastUtteranceRef.current = null
  }, [])

  // ── Retry traducción fallida ───────────────────────────────────────────
  // ConversationView puede llamar esto cuando el usuario toca el botón de retry
  const handleRetryTranslation = useCallback(async (id) => {
    const u = utterances.find(u => u.id === id)
    if (!u || !u.failed) return

    const targetLang = u.lang === 'en' ? 'es' : 'en'

    setUtterances(prev => prev.map(x =>
      x.id === id ? { ...x, translating: true, failed: false } : x
    ))

    let translation = null
    try {
      translation = await translateText({
        text: u.text,
        from: u.lang,
        to:   targetLang,
        context: TRANSLATION_CONTEXT,
      })
    } catch { /* silencioso */ }

    setUtterances(prev => prev.map(x =>
      x.id === id
        ? { ...x, translation, translating: false, failed: !translation }
        : x
    ))
  }, [utterances])

  // ── handleFinal ────────────────────────────────────────────────────────
  const handleFinal = useCallback(async ({ text, lang, speechFinal }) => {
    setInterimText('')

    if (prewarmTimerRef.current) {
      clearTimeout(prewarmTimerRef.current)
      prewarmTimerRef.current = null
    }

    const now       = Date.now()
    const l         = normLang(lang)      // NUEVO: normalizar a 'en' | 'es'
    const isSubOnly = subtitleOnlyRef.current
    const endsWithP = TERMINAL_PUNCT.test(text)

    // ── Sentence merger ────────────────────────────────────────────────
    const prev = lastUtteranceRef.current
    const withinWindow = (now - lastFinalTimeRef.current) < MERGE_WINDOW_MS
    const shouldMerge  = (
      prev               &&
      withinWindow       &&
      prev.lang === l    &&
      !prev.endsWithPunct &&
      !speechFinal
    )

    lastFinalTimeRef.current = now

    if (shouldMerge) {
      const mergedText = prev.text + ' ' + text
      const targetLang = l === 'en' ? 'es' : 'en'

      lastUtteranceRef.current = {
        id:            prev.id,
        text:          mergedText,
        lang:          l,
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
            context: TRANSLATION_CONTEXT,
          })
        } catch { /* silencioso */ }
        setUtterances(utt => utt.map(u =>
          u.id === prev.id
            ? { ...u, translation, translating: false, failed: !translation }
            : u
        ))
      }
      return
    }

    // ── Nuevo utterance ────────────────────────────────────────────────
    const id         = uid()
    const targetLang = l === 'en' ? 'es' : 'en'
    const timestamp  = new Date()

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
        context: TRANSLATION_CONTEXT,
      })
    } catch { /* silencioso */ }

    // NUEVO: si translation es null → marcar como failed para UI de retry
    setUtterances(utt => utt.map(u =>
      u.id === id
        ? { ...u, translation, translating: false, failed: !translation }
        : u
    ))
  }, [])

  // ── handleInterim ──────────────────────────────────────────────────────
  const handleInterim = useCallback(({ text, lang }) => {
    setInterimText(text)
    const l = normLang(lang)
    setInterimLang(l)

    if (subtitleOnlyRef.current) return

    if (prewarmTimerRef.current) clearTimeout(prewarmTimerRef.current)
    prewarmTimerRef.current = setTimeout(() => {
      prewarmTranslation({ text, from: l })
      prewarmTimerRef.current = null
    }, PREWARM_DEBOUNCE_MS)
  }, [])

  // ── Error de transcripción ─────────────────────────────────────────────
  const handleTranscriptionError = useCallback((err) => {
    setFooterError(err)
    setPlaying(false)
  }, [])

  // ── Transcription ──────────────────────────────────────────────────────
  const {
    start: startTranscription,
    stop:  stopTranscription,
    error: transcriptionError,
  } = useTranscription({
    onFinal:   handleFinal,
    onInterim: handleInterim,
    onError:   handleTranscriptionError,
  })

  // ── Audio stream ───────────────────────────────────────────────────────
  const getAudioStream = useCallback(async () => {
    if (source === 'tab') {
      const r = await startBrowserCapture()
      if (!r.stream) throw new Error(r.userMessage || 'Tab capture cancelled.')
      return r.stream
    }
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  }, [source])

  // ── Play / Stop ────────────────────────────────────────────────────────
  const handleTogglePlay = useCallback(async () => {
    if (!playing) {
      setFooterError(null)
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

  // ── Render ─────────────────────────────────────────────────────────────
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
      />
      <main className="app-main">
        <ConversationView
          utterances={utterances}
          interimText={interimText}
          interimLang={interimLang}
          subtitleOnly={subtitleOnly}
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
