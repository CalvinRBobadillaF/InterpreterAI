/**
 * components/Header.jsx
 *
 * BUG ELIMINADO:
 *   handleElectronAudio() creaba un stream de audio independiente que nunca
 *   se cerraba, en paralelo al stream que ya manejaba App.jsx. Doble stream,
 *   doble consumo de memoria, comportamiento impredecible. Eliminado.
 *   App.jsx es el único responsable de crear y cerrar streams.
 *
 * NUEVO:
 *   Botón "Solo Subtítulos / + Traducción" que activa/desactiva la traducción.
 *   Al activar modo subtítulos, TranslationPanel recibe translated='' y no
 *   muestra la sección de traducción. No hace llamadas al backend.
 */

import { useState, useEffect, useRef } from 'react'
import {
  Play, Square, ChevronDown,
  Mic, Globe, Sun, Moon, Captions, Languages,
} from 'lucide-react'

// ── Waveform ──────────────────────────────────────────────────────
const BAR_COUNT   = 72
const BAR_HEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const v = Math.abs(Math.sin(i * 0.47) * 0.5 + Math.sin(i * 0.11) * 0.5)
  return Math.round(3 + v * 14)
})

function Waveform({ active }) {
  return (
    <div className={`waveform ${active ? 'waveform--active' : ''}`}>
      {BAR_HEIGHTS.map((h, i) => (
        <div key={i} className="waveform__bar" style={{ height: h }} />
      ))}
      <div className="waveform__cursor" />
    </div>
  )
}

// ── Timer ─────────────────────────────────────────────────────────
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

  const hh = String(Math.floor(secs / 3600)).padStart(2, '0')
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// ── Fuentes de audio disponibles ─────────────────────────────────
const FUENTES = [
  {
    id:    'mic',
    label: 'Microphone',
    sub:   'Default input',
    Icon:  Mic,
    note:  'Captura el micrófono del dispositivo',
  },
  {
    id:    'tab',
    label: 'Browser Tab',
    sub:   'Tab / screen',
    Icon:  Globe,
    note:  'Elige una pestaña en el diálogo de compartir',
  },
]


// ── Header ────────────────────────────────────────────────────────
export function Header({
  playing,
  onTogglePlay,
  source,
  onSourceChange,
  subtitleOnly,       // boolean — modo solo subtítulos activo
  onToggleSubtitleOnly, // callback para alternarlo
}) {
  const timer = useTimer(playing)

  // Tema claro / oscuro
  const [lightTheme, setLightTheme] = useState(
    () => localStorage.getItem('theme') === 'light'
  )
  useEffect(() => {
    document.documentElement.classList.toggle('light', lightTheme)
    localStorage.setItem('theme', lightTheme ? 'light' : 'dark')
  }, [lightTheme])

  // Dropdown de fuente de audio
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef  = useRef(null)
  const fuenteActiva = FUENTES.find(f => f.id === source) || FUENTES[0]

  // Cierra el dropdown al hacer clic fuera
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const seleccionarFuente = (id) => {
    onSourceChange?.(id)
    setDropdownOpen(false)
  }

  // Cierra sesión limpiando todas las claves
  const handleLogout = () => {
    localStorage.removeItem('app_name')
    localStorage.removeItem('app_key')
    localStorage.removeItem('deepl_key')
    window.location.reload()
  }

  return (
    <header className="app-header drag">

      {/* Nombre de la app */}
      <span className="header-brand__title no-drag">Interpreter AI</span>

      {/* Selector de fuente de audio */}
      <div className="header-source-wrap no-drag" ref={dropdownRef}>
        <button
          className="header-source"
          onClick={() => !playing && setDropdownOpen(o => !o)}
          disabled={playing}
          title={playing ? 'Detén la grabación para cambiar la fuente' : 'Seleccionar fuente'}
        >
          <fuenteActiva.Icon size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <div className="header-source__lines">
            <span className="header-source__label">{fuenteActiva.label}</span>
            <span className="header-source__sub">{fuenteActiva.sub}</span>
          </div>
          <ChevronDown size={11} style={{ color: 'var(--text-faint)' }} />
        </button>

        {dropdownOpen && (
          <div className="source-dropdown">
            {FUENTES.map(({ id, label, sub, Icon, note }) => (
              <button
                key={id}
                className={`source-dropdown__item ${id === source ? 'is-active' : ''}`}
                onClick={() => seleccionarFuente(id)}
              >
                <div className="source-dropdown__icon"><Icon size={14} /></div>
                <div className="source-dropdown__text">
                  <span className="source-dropdown__label">{label}</span>
                  <span className="source-dropdown__note">{note}</span>
                </div>
                {id === source && <div className="source-dropdown__check">✓</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Botón Play / Stop */}
      <button
        className={`header-play no-drag ${playing ? 'is-playing' : ''}`}
        onClick={onTogglePlay}
        title={playing ? 'Detener' : 'Iniciar'}
      >
        {playing
          ? <Square size={14} fill="white" strokeWidth={0} />
          : <Play   size={14} fill="white" strokeWidth={0} style={{ marginLeft: 1 }} />
        }
      </button>

      {/* Waveform + Timer */}
      <div className="header-wave-block no-drag">
        <span className="header-timer">{timer}</span>
        <Waveform active={playing} />
      </div>

      {/* Controles del lado derecho */}
      <div className="header-right no-drag">

        {/* ── NUEVO: Botón Solo Subtítulos ───────────────────────
            Alterna entre mostrar solo subtítulos (sin traducción)
            o subtítulos + traducción.                             */}
        <button
          className={`header-icon-btn header-subtitle-toggle ${subtitleOnly ? 'is-active' : ''}`}
          onClick={onToggleSubtitleOnly}
          title={subtitleOnly ? 'Activar traducción' : 'Solo subtítulos (sin traducción)'}
        >
          {subtitleOnly
            ? <Captions   size={15} />   // ícono: solo subtítulos activo
            : <Languages  size={15} />   // ícono: modo traducción activo
          }
          <span className="header-subtitle-toggle__label">
            {subtitleOnly ? 'Subtítulos' : 'Traducción'}
          </span>
        </button>

        {/* Tema */}
        <button
          className="header-icon-btn"
          onClick={() => setLightTheme(t => !t)}
          title="Cambiar tema"
        >
          {lightTheme ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        {/* Nombre del usuario */}
        <span className="userName">
          {localStorage.getItem('app_name') || 'Guest'}
        </span>

        {/* Cerrar sesión */}
        <button className="log-out-button" onClick={handleLogout} title="Cerrar sesión">
          Log out
        </button>

      </div>
    </header>
  )
}
