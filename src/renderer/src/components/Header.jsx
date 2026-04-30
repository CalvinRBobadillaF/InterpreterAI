/**
 * components/Header.jsx
 *
 * Rediseño: Floating pill en top-right corner.
 * Fondo oscuro profundo, controles compactos.
 * Sin barra horizontal tradicional — los controles flotan sobre el contenido.
 */

import { useState, useEffect, useRef } from 'react'
import {
  Play, Square, ChevronDown,
  Mic, Globe, Sun, Moon, Captions, Languages, LogOut
} from 'lucide-react'

// ── Waveform ──────────────────────────────────────────────────────────────
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

// ── Timer ──────────────────────────────────────────────────────────────────
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

// ── Fuentes de audio ───────────────────────────────────────────────────────
const FUENTES = [
  { id: 'mic', label: 'Microphone', sub: 'Device input', Icon: Mic },
  { id: 'tab', label: 'Browser Tab', sub: 'Tab audio',   Icon: Globe },
]

// ── Separador vertical ─────────────────────────────────────────────────────
function Sep() {
  return <div className="hdr-sep" aria-hidden />
}

// ── Componente principal ───────────────────────────────────────────────────
export function Header({
  playing,
  onTogglePlay,
  source,
  onSourceChange,
  subtitleOnly,
  onToggleSubtitleOnly,
  onLogout,
}) {
  const timer       = useTimer(playing)
  const dropRef     = useRef(null)
  const [dropOpen,  setDropOpen]   = useState(false)
  const [lightTheme, setLightTheme] = useState(
    () => localStorage.getItem('theme') === 'light'
  )

  useEffect(() => {
    document.documentElement.classList.toggle('light', lightTheme)
    localStorage.setItem('theme', lightTheme ? 'light' : 'dark')
  }, [lightTheme])

  useEffect(() => {
    const fn = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const fuenteActiva = FUENTES.find(f => f.id === source) || FUENTES[0]
  const username     = localStorage.getItem('app_name') || 'Guest'

  return (
    <header className="hdr no-drag">

      {/* ── LEFT: Brand + source selector ─────────────────────── */}
      <div className="hdr-left">
        <span className="hdr-brand">Interpreter <span className="hdr-brand-ai">AI</span></span>

        <Sep />

        {/* Source selector */}
        <div className="hdr-source-wrap" ref={dropRef}>
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
      </div>

      {/* ── CENTER: Play + Waveform + Timer ──────────────────── */}
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

      {/* ── RIGHT: Toggles + User ─────────────────────────────── */}
      <div className="hdr-right">

        {/* Subtitles / Translation toggle */}
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

        {/* Theme */}
        <button
          className="hdr-icon"
          onClick={() => setLightTheme(t => !t)}
          title="Toggle theme"
        >
          {lightTheme ? <Moon size={13} strokeWidth={2} /> : <Sun size={13} strokeWidth={2} />}
        </button>

        {/* User */}
        <span className="hdr-username">{username}</span>

        {/* Logout */}
        <button className="hdr-icon" onClick={onLogout} title="Log out">
          <LogOut size={13} strokeWidth={2} />
        </button>

      </div>
    </header>
  )
}
