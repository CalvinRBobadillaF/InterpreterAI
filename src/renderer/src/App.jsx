import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import './App.css'

import { LogIn }             from './components/LogIn'
import { Header }            from './components/Header'
import { Footer }            from './components/Footer'
import { ConversationView }  from './components/ConversationView'
import { useTranscription }  from './hooks/useTranscription'
import { translateText }     from './hooks/useTranslation'
import { startBrowserCapture } from './client/startBrowserCapture'

// ── ID único por utterance ────────────────────────────────────────────────
let _uid = 0
const uid = () => `u${++_uid}`

function App() {

  // ── Autenticación ─────────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!localStorage.getItem('app_key') && !!localStorage.getItem('app_name')
  )

  const handleLogout = useCallback(() => {
    localStorage.removeItem('app_key')
    localStorage.removeItem('app_name')
    setIsLoggedIn(false)
  }, [])

  // ── Grabación y fuente ────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false)
  const [source,  setSource]  = useState('mic')
  const streamRef = useRef(null)

  // ── Modo solo subtítulos ──────────────────────────────────────────────
  const [subtitleOnly, setSubtitleOnly] = useState(false)
  const subtitleOnlyRef = useRef(false)
  subtitleOnlyRef.current = subtitleOnly

  // ── Estado de conversación ────────────────────────────────────────────
  // utterances: [{ id, text, lang, translation, translating }]
  const [utterances,  setUtterances]  = useState([])
  const [interimText, setInterimText] = useState('')
  const [interimLang, setInterimLang] = useState('en')
  const [interimTranslation, setInterimTranslation] = useState('') // ⚡ NUEVO: Estado para traducción en vivo

  // ── Footer ────────────────────────────────────────────────────────────
  const [footerError, setFooterError] = useState(null)

  const footerStatus = useMemo(() => {
    if (!playing) return 'Idle'
    return subtitleOnly
      ? '🎙️ Listening — Subtitles only'
      : '🎙️ Listening — Auto EN/ES with translation'
  }, [playing, subtitleOnly])


  // ⚡ NUEVO: Smart Debounce para Traducción en Vivo ─────────────────────
  useEffect(() => {
    // Si no hay texto, o estamos en modo "solo subtítulos", no hacemos nada
    if (!interimText || subtitleOnly) {
      setInterimTranslation('')
      return
    }

    const targetLang = interimLang === 'en' ? 'es' : 'en'
    const abortController = new AbortController()

    // Esperamos 600ms de silencio parcial para disparar la traducción
    const delayDebounceFn = setTimeout(async () => {
      try {
        const translated = await translateText({ 
          text: interimText, 
          from: interimLang, 
          to: targetLang,
          signal: abortController.signal // Pasamos la señal para cancelar si el usuario sigue hablando
        })
        
        if (translated) {
          setInterimTranslation(translated)
        }
      } catch (e) {
        // Ignoramos el error si fue porque cancelamos la petición intencionalmente
        if (e.name !== 'AbortError') {
          console.error('[Interim Translation Error]', e)
        }
      }
    }, 600) // 600ms es el punto dulce entre velocidad y ahorro de API

    return () => {
      clearTimeout(delayDebounceFn)
      abortController.abort() // Cancelamos la petición HTTP vieja si el texto cambió
    }
  }, [interimText, interimLang, subtitleOnly])
  // ──────────────────────────────────────────────────────────────────────


  // ── Limpiar conversación ──────────────────────────────────────────────
  const handleClear = useCallback(() => {
    setUtterances([])
    setInterimText('')
    setInterimTranslation('') // ⚡ NUEVO: Limpiamos la traducción en vivo
  }, [])

  // ── handleFinal — llamado por Deepgram cuando el texto es definitivo ──
  const handleFinal = useCallback(async ({ text, lang }) => {
    setInterimText('')
    setInterimTranslation('') // ⚡ NUEVO: Limpiamos porque ya se vuelve final

    const id = uid()
    const l          = lang.startsWith('en') ? 'en' : 'es'
    const targetLang = l === 'en' ? 'es' : 'en'
    const isSubOnly  = subtitleOnlyRef.current

    setUtterances(prev => [
      ...prev,
      { id, text, lang: l, translation: null, translating: !isSubOnly },
    ])

    if (isSubOnly) return

    const translation = await translateText({ text, from: l, to: targetLang })
    if (translation) {
      setUtterances(prev =>
        prev.map(u => u.id === id ? { ...u, translation, translating: false } : u)
      )
    }
  }, [])

  // ── handleInterim — texto parcial en vivo ─────────────────────────────
  const handleInterim = useCallback(({ text, lang }) => {
    setInterimText(text)
    setInterimLang(lang.startsWith('en') ? 'en' : 'es')
  }, [])

  // ── handleError de transcripción ──────────────────────────────────────
  const handleTranscriptionError = useCallback((err) => {
    setFooterError(err)
    setPlaying(false)
  }, [])

  // ── Hook de transcripción ─────────────────────────────────────────────
  const {
    start: startTranscription,
    stop:  stopTranscription,
    error: transcriptionError,
  } = useTranscription({
    onFinal:  handleFinal,
    onInterim: handleInterim,
    onError:  handleTranscriptionError,
  })

  // ── Obtener stream de audio ────────────────────────────────────────────
  const getAudioStream = useCallback(async () => {
    if (source === 'tab') {
      const resultado = await startBrowserCapture()
      if (!resultado.stream) {
        throw new Error(resultado.userMessage || 'Tab capture cancelled.')
      }
      return resultado.stream
    }
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  }, [source])

  // ── Play / Stop ────────────────────────────────────────────────────────
  const handleTogglePlay = useCallback(async () => {
    if (!playing) {
      setFooterError(null)

      let stream = null
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
      setInterimTranslation('') // ⚡ NUEVO: Limpiamos al detener
      setPlaying(false)
    }
  }, [playing, getAudioStream, startTranscription, stopTranscription])

  // ── Render ─────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return <LogIn onLogin={() => setIsLoggedIn(true)} />
  }

  const footerErrorFinal = footerError
    || (transcriptionError ? `STT: ${transcriptionError}` : null)

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
          interimTranslation={interimTranslation} // ⚡ NUEVO: Pasamos el estado a la vista
          subtitleOnly={subtitleOnly}
          playing={playing}
          onClear={handleClear}
        />
      </main>

      <Footer
        status={footerStatus}
        error={footerErrorFinal}
      />
    </div>
  )
}

export default App