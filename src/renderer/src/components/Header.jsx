/**
 * components/Header.jsx
 *
 * NUEVO: botón "¿quién va a hablar?" — decide si el próximo Play usa
 * Deepgram (EN/ES) o Gladia (Kreyòl). Es manual porque no hay forma de
 * autodetectar Kreyòl de forma confiable mezclado con otros 100+ idiomas
 * (por eso fallaba antes) — Gladia necesita que le digamos explícitamente
 * "escucha Kreyòl", así que el usuario indica el turno, como un walkie-talkie.
 *
 * El botón de Kreyòl/EN⇄ES (htMode) sigue existiendo pero se desactiva
 * visualmente cuando captureKreyol está activo, porque en ese caso no
 * aplica — el destino de la traducción de Kreyòl es siempre adaptativo.
 */

import { useState, useEffect, useRef } from 'react'
import {
  Play, Square, ChevronDown, MoreVertical,
  Mic, Globe, Sun, Moon, Captions, Languages, LogOut, Monitor
} from 'lucide-react'
import { isElectron } from '../hooks/isElectron'

const BAR_COUNT   = 28
const BAR_HEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const v = Math.abs(Math.sin(i * 0.52) * 0.6 + Math.sin(i * 0.13) * 0.4)
  return Math.round(3 + v * 10)
})

function Waveform({ active }) {
  return (
    <div className={`hdr-wave ${active ? 'hdr-wave--on' : ''}`} aria-hidden>
      {BAR_HEIGHTS.map((h, i) => (
        <span key={i} className="hdr-wave__bar" style={{ '--h': `${h}px` }} />
      ))}
    </div>
  )
}

function useTimer(running) {
  const [secs, setSecs] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSecs(s => s + 1), 1000)
    } else {
      clearInterval(ref.current)
      setSecs(0)
    }
    return () => clearInterval(ref.current)
  }, [running])
  const h = String(Math.floor(secs / 3600)).padStart(2, '0')
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

const FUENTES_WEB = [
  { id: 'mic', label: 'Microphone', sub: 'Device input', Icon: Mic },
  { id: 'tab', label: 'Browser Tab', sub: 'Tab audio via getDisplayMedia', Icon: Globe },
]
const FUENTES_ELECTRON = [
  { id: 'mic', label: 'Microphone', sub: 'Device input', Icon: Mic },
  { id: 'system', label: 'System Audio', sub: 'Computer output', Icon: Monitor },
]

function Sep() {
  return <div className="hdr-sep" aria-hidden />
}

export function Header({
  playing,
  onTogglePlay,
  source,
  onSourceChange,
  subtitleOnly,
  onToggleSubtitleOnly,
  onLogout,
  htMode,
  onToggleHtMode,
  captureKreyol,
  onToggleCaptureKreyol,
}) {
  const timer   = useTimer(playing)
  const headerRef = useRef(null)
  const [dropOpen,   setDropOpen]   = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileSourceOpen, setMobileSourceOpen] = useState(false)
  const [lightTheme, setLightTheme] = useState(() => localStorage.getItem('theme') === 'light')

  const FUENTES = isElectron() ? FUENTES_ELECTRON : FUENTES_WEB

  useEffect(() => {
    document.documentElement.classList.toggle('light', lightTheme)
    localStorage.setItem('theme', lightTheme ? 'light' : 'dark')
  }, [lightTheme])

  useEffect(() => {
    const fn = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setDropOpen(false)
        setMenuOpen(false)
        setMobileSourceOpen(false)
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const fuenteActiva = FUENTES.find(f => f.id === source) || FUENTES[0]
  const username     = localStorage.getItem('app_name') || 'Guest'

  return (
    <header className="hdr no-drag" ref={headerRef}>
      <div className="hdr-left">
        <span className="hdr-brand">Interpreter <span className="hdr-brand-ai">AI</span></span>
        <Sep />
        <div className="hdr-source-wrap">
          <button
            className="hdr-btn hdr-source-btn"
            onClick={() => !playing && setDropOpen(o => !o)}
            disabled={playing}
            title="Audio source"
          >
            <fuenteActiva.Icon size={12} strokeWidth={2} />
            <span className="hdr-btn-label">{fuenteActiva.label}</span>
            <ChevronDown size={10} className="hdr-chevron" />
          </button>
          {dropOpen && (
            <div className="hdr-dropdown">
              {FUENTES.map(({ id, label, sub, Icon }) => (
                <button
                  key={id}
                  className={`hdr-dropdown-item ${id === source ? 'is-active' : ''}`}
                  onClick={() => { onSourceChange?.(id); setDropOpen(false) }}
                >
                  <div className="hdr-dropdown-icon"><Icon size={13} /></div>
                  <div className="hdr-dropdown-text">
                    <span className="hdr-dropdown-label">{label}</span>
                    <span className="hdr-dropdown-sub">{sub}</span>
                  </div>
                  {id === source && <span className="hdr-dropdown-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <Sep />

        {/* NUEVO: ¿quién va a hablar? decide Deepgram vs Gladia */}
        <button
          className={`hdr-btn ${captureKreyol ? 'hdr-btn--active' : ''}`}
          onClick={onToggleCaptureKreyol}
          disabled={playing}
          title={captureKreyol
            ? 'Escuchando en Kreyòl (Gladia) — clic para volver a EN/ES (Deepgram)'
            : 'Escuchando EN/ES (Deepgram) — clic para cambiar a alguien hablando Kreyòl'}
        >
          <span className="hdr-btn-label">
            {captureKreyol ? '🇭🇹 Kreyòl mic' : '🇺🇸🇪🇸 EN/ES mic'}
          </span>
        </button>

        <Sep />

        {/* Solo aplica cuando NO se está capturando Kreyòl */}
        <button
          className={`hdr-btn ${htMode && !captureKreyol ? 'hdr-btn--active' : ''}`}
          onClick={onToggleHtMode}
          disabled={playing || captureKreyol}
          title={captureKreyol
            ? 'No aplica mientras capturas Kreyòl — el destino se elige solo'
            : htMode
              ? 'EN/ES se traduce a Kreyòl — clic para EN ⇄ ES normal'
              : 'Modo normal EN ⇄ ES — clic para traducir hacia Kreyòl'}
        >
          <span className="hdr-btn-label">
            {htMode ? '🇺🇸🇪🇸→🇭🇹 Kreyòl' : '🇺🇸⇄🇪🇸 EN/ES'}
          </span>
        </button>
      </div>

      <div className="hdr-center">
        <button
          className={`hdr-play ${playing ? 'hdr-play--stop' : ''}`}
          onClick={onTogglePlay}
          title={playing ? 'Stop' : 'Start'}
        >
          {playing
            ? <Square size={12} fill="currentColor" strokeWidth={0} />
            : <Play   size={12} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />
          }
        </button>
        <Waveform active={playing} />
        <span className="hdr-timer">{timer}</span>
      </div>

      <div className="hdr-right">
        <button
          className={`hdr-btn ${subtitleOnly ? 'hdr-btn--active' : ''}`}
          onClick={onToggleSubtitleOnly}
          title={subtitleOnly ? 'Subtitles only' : 'With translation'}
        >
          {subtitleOnly
            ? <Captions  size={13} strokeWidth={2} />
            : <Languages size={13} strokeWidth={2} />
          }
          <span className="hdr-btn-label">{subtitleOnly ? 'Subtitles' : 'Translate'}</span>
        </button>

        <Sep />

        <button className="hdr-icon" onClick={() => setLightTheme(t => !t)} title="Toggle theme">
          {lightTheme ? <Moon size={13} strokeWidth={2} /> : <Sun size={13} strokeWidth={2} />}
        </button>

        <span className="hdr-username">{username}</span>

        <button className="hdr-icon" onClick={onLogout} title="Log out">
          <LogOut size={13} strokeWidth={2} />
        </button>
      </div>

      <div className="hdr-mobile-controls">
        <span className="hdr-mobile-brand">Interpreter <span className="hdr-brand-ai">AI</span></span>
        <div className="hdr-mobile-playback">
          <button
            className={`hdr-play ${playing ? 'hdr-play--stop' : ''}`}
            onClick={onTogglePlay}
            title={playing ? 'Stop' : 'Start'}
            aria-label={playing ? 'Stop transcription' : 'Start transcription'}
          >
            {playing ? <Square size={15} fill="currentColor" strokeWidth={0} /> : <Play size={15} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />}
          </button>
          <span className="hdr-timer">{timer}</span>
        </div>
        <div className="hdr-mobile-menu-wrap">
          <button
            className={`hdr-icon hdr-mobile-menu-button ${menuOpen ? 'is-active' : ''}`}
            onClick={() => { setMenuOpen(open => !open); setMobileSourceOpen(false) }}
            title="Options"
            aria-label="Open options"
            aria-expanded={menuOpen}
          >
            <MoreVertical size={20} strokeWidth={2} />
          </button>
          {menuOpen && (
            <div className="hdr-mobile-menu" role="menu">
              <div className="hdr-mobile-source-wrap">
                <button className="hdr-mobile-menu-item" onClick={() => !playing && setMobileSourceOpen(open => !open)} disabled={playing}>
                  <fuenteActiva.Icon size={16} />
                  <span>Audio: {fuenteActiva.label}</span>
                  <ChevronDown size={15} className="hdr-mobile-menu-chevron" />
                </button>
                {mobileSourceOpen && (
                  <div className="hdr-mobile-source-dropdown">
                    {FUENTES.map(({ id, label, Icon }) => (
                      <button key={id} className={`hdr-mobile-menu-item ${id === source ? 'is-active' : ''}`} onClick={() => { onSourceChange?.(id); setMobileSourceOpen(false) }}>
                        <Icon size={16} /><span>{label}</span>{id === source && <span className="hdr-dropdown-check">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className={`hdr-mobile-menu-item ${captureKreyol ? 'is-active' : ''}`} onClick={onToggleCaptureKreyol} disabled={playing}>
                <Mic size={16} /><span>{captureKreyol ? 'Kreyòl microphone' : 'EN/ES microphone'}</span>
              </button>
              <button className={`hdr-mobile-menu-item ${htMode && !captureKreyol ? 'is-active' : ''}`} onClick={onToggleHtMode} disabled={playing || captureKreyol}>
                <Languages size={16} /><span>{htMode ? 'Translate EN/ES to Kreyòl' : 'Translate EN ⇄ ES'}</span>
              </button>
              <button className={`hdr-mobile-menu-item ${subtitleOnly ? 'is-active' : ''}`} onClick={onToggleSubtitleOnly}>
                <Captions size={16} /><span>{subtitleOnly ? 'Subtitles only' : 'Show translations'}</span>
              </button>
              <div className="hdr-mobile-menu-divider" />
              <button className="hdr-mobile-menu-item" onClick={() => setLightTheme(t => !t)}>
                {lightTheme ? <Moon size={16} /> : <Sun size={16} />}<span>{lightTheme ? 'Dark theme' : 'Light theme'}</span>
              </button>
              <button className="hdr-mobile-menu-item" onClick={onLogout}>
                <LogOut size={16} /><span>Log out {username}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
