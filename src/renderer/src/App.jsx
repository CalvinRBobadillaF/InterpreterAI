/**
 * App.jsx  —  Interpreter AI
 *
 * ACTUALIZADO:
 * - Integración de isAutoMode para permitir que la IA detecte el idioma si es necesario.
 * - Los controles de idioma ahora viven en el Header.
 * - Atajo global (Ctrl + Space) bloqueado si está en modo Automático.
 * - Footer dinámico según el modo activo.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
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

  // ── ESTADO DE MODOS Y RUTEO (Auto vs Manual) ──────────────────
  const [isAutoMode, setIsAutoMode] = useState(false) // 👈 NUEVO: Controla si usamos 1 o 2 WebSockets
  const activeLangRef = useRef('en-US')
  const [activeLangUI, setActiveLangUI] = useState('en-US')

  // Función para alternar el idioma (Solo en modo manual)
  const toggleLanguage = useCallback(() => {
    const newLang = activeLangRef.current === 'en-US' ? 'es-419' : 'en-US'
    activeLangRef.current = newLang
    setActiveLangUI(newLang)
  }, [])

  // Atajo de teclado: Ctrl + Espacio para cambiar el idioma
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignorar si el usuario está escribiendo o si está en Modo Automático
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || isAutoMode) return;

      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault() // Evita el scroll accidental
        toggleLanguage()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleLanguage, isAutoMode]) // 👈 Agregamos isAutoMode a las dependencias


  // ── Modo: solo subtítulos (sin traducción) ────────────────────
  const [subtitleOnly, setSubtitleOnly] = useState(false)

  // ── Texto transcrito (confirmado e interim) ───────────────────
  const [englishText,    setEnglishText]    = useState('')
  const [spanishText,    setSpanishText]    = useState('')
  const [interimEnglish, setInterimEnglish] = useState('')
  const [interimSpanish, setInterimSpanish] = useState('')

  // ── Footer ────────────────────────────────────────────────────
  const [footerError,  setFooterError]  = useState(null)

  // Footer dinámico basado en si estamos grabando y qué canal está activo
  const getFooterStatus = () => {
    if (!playing) return 'Idle'
    if (isAutoMode) return '🎙️ Escuchando: MODO AUTOMÁTICO (Inglés y Español)'
    
    const langLabel = activeLangUI === 'en-US' ? 'INGLÉS (Agente)' : 'ESPAÑOL (Cliente)'
    return `🎙️ Escuchando: ${langLabel} — Presiona Ctrl+Espacio para cambiar`
  }

  const streamRef = useRef(null)

  // ── Limpiar paneles ───────────────────────────────────────────
  const handleClearLeft  = () => { setEnglishText('');  setInterimEnglish('') }
  const handleClearRight = () => { setSpanishText('');  setInterimSpanish('') }

  // ── Traducción automática ─────────────────────────────────────
  const textoParaTraducirEN = subtitleOnly ? '' : englishText
  const textoParaTraducirES = subtitleOnly ? '' : spanishText

  const { translatedText: enToEs, translating: traduciendoEN } =
    useAutoTranslation(textoParaTraducirEN, { from: 'en', to: 'es', debounceMs: 300 })

  const { translatedText: esToEn, translating: traduciendoES } =
    useAutoTranslation(textoParaTraducirES, { from: 'es', to: 'en', debounceMs: 300 })

  // ── Transcripción en tiempo real ──────────────────────────────
  const { start: startTranscription, stop: stopTranscription, error: transcriptionError } =
    useTranscription({
      activeLangRef,
      isAutoMode, // 👈 Pasamos el estado de modo automático al hook

      onFinal: useCallback(({ text, lang }) => {
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
      } else if (source === 'tab') {
        const resultado = await startBrowserCapture()
        if (!resultado.stream) {
          setFooterError(resultado.userMessage || 'Captura de pestaña cancelada.')
          return
        }
        stream = resultado.stream
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      }

      streamRef.current = stream
      
      // Reiniciamos al inglés por defecto cada vez que inicia una llamada nueva en modo manual
      activeLangRef.current = 'en-US'
      setActiveLangUI('en-US')
      
      await startTranscription(stream)
      setPlaying(true)

    } else {
      stopTranscription()
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setInterimEnglish('')
      setInterimSpanish('')
      setPlaying(false)
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
        // 👇 Nuevos props del Header para controlar los idiomas
        isAutoMode={isAutoMode}
        onToggleAutoMode={() => setIsAutoMode(prev => !prev)}
        activeLangUI={activeLangUI}
        onToggleLanguage={toggleLanguage}
      />

      <main className="app-main">
        {/* Panel izquierdo: EN original → traducción ES */}
        <TranslationPanel
          fromLang="EN"
          toLang="ES"
          placeholder={playing ? (isAutoMode ? 'Escuchando (Modo Auto)...' : 'Escuchando Inglés...') : 'Presiona ▶ para comenzar'}
          value={englishText}
          translated={enToEs}
          interimText={interimEnglish}
          loading={traduciendoEN}
          onChange={(e) => setEnglishText(e.target.value)}
          onClear={handleClearLeft}
          subtitleOnly={subtitleOnly}
        />

        {/* Panel derecho: ES original → traducción EN */}
        <TranslationPanel
          fromLang="ES"
          toLang="EN"
          readOnly
          value={spanishText}
          translated={esToEn}
          interimText={interimSpanish}
          loading={traduciendoES}
          onClear={handleClearRight}
          subtitleOnly={subtitleOnly}
        />
      </main>

      <Footer
        status={subtitleOnly ? `${getFooterStatus()} · Solo subtítulos` : getFooterStatus()}
        error={footerError || (transcriptionError ? `STT: ${transcriptionError}` : null)}
      />
    </div>
  )
}

export default App