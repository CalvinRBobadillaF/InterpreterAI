import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import './App.css'

import { LogIn }             from './components/LogIn'
import { Header }            from './components/Header'
import { Footer }            from './components/Footer'
import { ConversationView }  from './components/ConversationView'
import { useTranscription }  from './hooks/useTranscription'
import { translateText }     from './hooks/useTranslation'
import { startBrowserCapture } from './client/startBrowserCapture'

let _uid = 0
const uid = () => `u${++_uid}`

// ── Constantes de sentence merger ─────────────────────────────────────────
// Si un is_final llega dentro de este período después del anterior
// y el anterior no termina con puntuación de cierre → se fusionan.
const MERGE_WINDOW_MS  = 600
const TERMINAL_PUNCT   = /[.!?…]$/

function App() {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem('app_key')?.trim() && !!localStorage.getItem('app_name')
  )
  const handleLogout = useCallback(() => {
    localStorage.removeItem('app_key')
    localStorage.removeItem('app_name')
    setIsLoggedIn(false)
  }, [])

  // ── Playback ──────────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false)
  const [source,  setSource]  = useState('mic')
  const streamRef = useRef(null)

  // ── Subtitle-only ─────────────────────────────────────────────────────────
  const [subtitleOnly,    setSubtitleOnly]    = useState(false)
  const subtitleOnlyRef = useRef(false)
  subtitleOnlyRef.current = subtitleOnly

  // ── Conversation state ────────────────────────────────────────────────────
  // Cada utterance: { id, text, lang, translation, translating, timestamp }
  const [utterances,  setUtterances]  = useState([])
  const [interimText, setInterimText] = useState('')
  const [interimLang, setInterimLang] = useState('en')

  // Sentence merger: refs para no recrear handleFinal en cada render
  const lastFinalTimeRef = useRef(0)
  const lastUtteranceRef = useRef(null)   // { id, text, lang, endsWithPunct }

  // ── Footer ────────────────────────────────────────────────────────────────
  const [footerError, setFooterError] = useState(null)
  const footerStatus = useMemo(() => {
    if (!playing) return 'Idle'
    return subtitleOnly ? '🎙️ Listening — Subtitles only' : '🎙️ Listening — Auto EN/ES'
  }, [playing, subtitleOnly])

  // ── Clear ─────────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    setUtterances([])
    setInterimText('')
    lastFinalTimeRef.current  = 0
    lastUtteranceRef.current  = null
  }, [])

  // ── handleFinal ───────────────────────────────────────────────────────────
  // FIXES:
  // A. try/finally garantiza que `translating` siempre pasa a false,
  //    incluso si translateText lanza o devuelve null.
  // B. Sentence merger: si el final llega dentro de MERGE_WINDOW_MS
  //    y el utterance anterior no terminaba con punto/signo → se fusionan
  //    en lugar de crear un card nuevo.
  const handleFinal = useCallback(async ({ text, lang, speechFinal }) => {
    setInterimText('')

    const now        = Date.now()
    const l          = lang.startsWith('en') ? 'en' : 'es'
    const isSubOnly  = subtitleOnlyRef.current
    const endsWithP  = TERMINAL_PUNCT.test(text)

    // ── Sentence merger ──────────────────────────────────────────────────
    const prev = lastUtteranceRef.current
    const withinWindow = (now - lastFinalTimeRef.current) < MERGE_WINDOW_MS
    const shouldMerge  = (
      prev               &&
      withinWindow       &&
      prev.lang === l    &&
      !prev.endsWithPunct &&
      !speechFinal        // si Deepgram dice que la frase terminó, no fusionar
    )

    lastFinalTimeRef.current = now

    if (shouldMerge) {
      // Fusionar con el utterance anterior
      const mergedText = prev.text + ' ' + text
      const targetLang = l === 'en' ? 'es' : 'en'

      lastUtteranceRef.current = {
        id:           prev.id,
        text:         mergedText,
        lang:         l,
        endsWithPunct: TERMINAL_PUNCT.test(mergedText),
      }

      // Actualizar el texto del card existente y reiniciar su traducción
      setUtterances(utt => utt.map(u =>
        u.id === prev.id
          ? { ...u, text: mergedText, translation: null, translating: !isSubOnly }
          : u
      ))

      if (!isSubOnly) {
        let translation = null
        try {
          translation = await translateText({ text: mergedText, from: l, to: targetLang })
        } catch {
          translation = mergedText
        } finally {
          setUtterances(utt => utt.map(u =>
            u.id === prev.id
              ? { ...u, translation: translation || mergedText, translating: false }
              : u
          ))
        }
      }
      return
    }

    // ── Nuevo utterance ──────────────────────────────────────────────────
    const id        = uid()
    const targetLang = l === 'en' ? 'es' : 'en'
    const timestamp  = new Date()

    lastUtteranceRef.current = { id, text, lang: l, endsWithPunct: endsWithP }

    setUtterances(prev => [
      ...prev,
      { id, text, lang: l, translation: null, translating: !isSubOnly, timestamp },
    ])

    if (isSubOnly) return

    // FIX A: try/finally — `translating` siempre vuelve a false
    let translation = null
    try {
      translation = await translateText({ text, from: l, to: targetLang })
    } catch {
      translation = text   // fallback al original
    } finally {
      setUtterances(utt => utt.map(u =>
        u.id === id
          ? { ...u, translation: translation || text, translating: false }
          : u
      ))
    }
  }, []) // Sin dependencias — usa refs

  // ── handleInterim ─────────────────────────────────────────────────────────
  const handleInterim = useCallback(({ text, lang }) => {
    setInterimText(text)
    setInterimLang(lang.startsWith('en') ? 'en' : 'es')
  }, [])

  // ── Error de transcripción ─────────────────────────────────────────────────
  const handleTranscriptionError = useCallback((err) => {
    setFooterError(err)
    setPlaying(false)
  }, [])

  // ── Transcription ─────────────────────────────────────────────────────────
  const {
    start: startTranscription,
    stop:  stopTranscription,
    error: transcriptionError,
  } = useTranscription({
    onFinal:   handleFinal,
    onInterim: handleInterim,
    onError:   handleTranscriptionError,
  })

  // ── Audio stream ──────────────────────────────────────────────────────────
  const getAudioStream = useCallback(async () => {
    if (source === 'tab') {
      const r = await startBrowserCapture()
      if (!r.stream) throw new Error(r.userMessage || 'Tab capture cancelled.')
      return r.stream
    }
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  }, [source])

  // ── Play / Stop ────────────────────────────────────────────────────────────
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
      stopTranscription()
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setInterimText('')
      setPlaying(false)
    }
  }, [playing, getAudioStream, startTranscription, stopTranscription])

  // ── Render ─────────────────────────────────────────────────────────────────
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
