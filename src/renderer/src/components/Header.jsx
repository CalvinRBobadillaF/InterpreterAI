/**
 * components/Header.jsx
 *
 * Fuentes de audio disponibles:
 * - mic    → Micrófono del dispositivo
 * - tab    → Pestaña del navegador (getDisplayMedia)
 * - system → Audio del sistema/PC completo (getDisplayMedia con preferencia de pantalla)
 *
 * El botón de subtítulos/traducción alterna `subtitleOnly` en App.jsx.
 */
import { useState, useEffect, useRef } from 'react'
import {
  Play, Square, ChevronDown,
  Mic, Globe, Sun, Moon, Captions, Languages, Monitor, Bot, Zap
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

// ── Fuentes de audio ───────────────────────────────────────────────
const FUENTES = [
  {
    id:    'mic',
    label: 'Microphone',
    sub:   'Default input',
    Icon:  Mic,
    note:  'Captura el micrófono del dispositivo',
    badge: null,
  },
  {
    id:    'tab',
    label: 'Browser Tab',
    sub:   'Tab / screen',
    Icon:  Globe,
    note:  'Elige una pestaña en el diálogo de compartir',
    badge: null,
  },
]

function Badge({ text }) {
  return (
    <span
      style={{
        fontSize:        9,
        fontWeight:      700,
        letterSpacing:   '0.04em',
        textTransform:   'uppercase',
        padding:         '1px 5px',
        borderRadius:    4,
        background:      'var(--accent, #6366f1)',
        color:           '#fff',
        lineHeight:      1.6,
        flexShrink:      0,
        alignSelf:       'center',
        marginLeft:      4,
        userSelect:      'none',
      }}
    >
      {text}
    </span>
  )
}

const SYSTEM_SUPPORT_LINES = [
  '✅ Windows + Chrome/Edge',
  '⚠️  macOS → necesita BlackHole o Loopback',
  '❌  Linux → sin soporte nativo',
]

function SystemAudioTooltip({ visible }) {
  if (!visible) return null
  return (
    <div
      style={{
        position:     'absolute',
        left:         'calc(100% + 8px)',
        top:          0,
        width:        210,
        background:   'var(--surface-2, #1e1e2e)',
        border:       '1px solid var(--border, #333)',
        borderRadius: 8,
        padding:      '8px 10px',
        zIndex:       9999,
        pointerEvents:'none',
        boxShadow:    '0 4px 18px rgba(0,0,0,.35)',
      }}
    >
      <p style={{ margin: '0 0 5px', fontSize: 10, fontWeight: 700,
                  color: 'var(--text-muted)', textTransform: 'uppercase',
                  letterSpacing: '0.05em' }}>
        Soporte por sistema
      </p>
      {SYSTEM_SUPPORT_LINES.map(line => (
        <p key={line} style={{ margin: '2px 0', fontSize: 11,
                               color: 'var(--text, #e0e0e0)', whiteSpace: 'nowrap' }}>
          {line}
        </p>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────
export function Header({
  playing,
  onTogglePlay,
  source,
  onSourceChange,
  subtitleOnly,
  onToggleSubtitleOnly,
  // Props de Idioma
  isAutoMode,
  onToggleAutoMode,
  activeLangUI,
  onToggleLanguage
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

  // Dropdown fuente de audio
  const [dropdownOpen,  setDropdownOpen]  = useState(false)
  const [hoveredSource, setHoveredSource] = useState(null)

  const dropdownRef  = useRef(null)
  const fuenteActiva = FUENTES.find(f => f.id === source) || FUENTES[0]

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
        setHoveredSource(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const seleccionarFuente = (id) => {
    if (id === 'system') {
      const supported = typeof navigator.mediaDevices?.getDisplayMedia === 'function'
      if (!supported) {
        alert(
          'Tu navegador no soporta getDisplayMedia.\n' +
          'Usa Chrome o Edge en HTTPS / localhost.'
        )
        return
      }
    }
    onSourceChange?.(id)
    setDropdownOpen(false)
    setHoveredSource(null)
  }

  const handleLogout = () => {
    localStorage.removeItem('app_name')
    localStorage.removeItem('app_key')
    localStorage.removeItem('deepl_key')
    window.location.reload()
  }

  return (
    <header className="app-header drag">

      <span className="header-brand__title no-drag">Interpreter AI</span>

      {/* ── Selector de fuente ─────────────────────────────────── */}
      <div className="header-source-wrap no-drag" ref={dropdownRef}>
        <button
          className="header-source"
          onClick={() => !playing && setDropdownOpen(o => !o)}
          disabled={playing}
          title={playing
            ? 'Detén la grabación para cambiar la fuente'
            : 'Seleccionar fuente de audio'}
        >
          <fuenteActiva.Icon
            size={13}
            style={{ color: 'var(--text-muted)', flexShrink: 0 }}
          />
          <div className="header-source__lines">
            <span className="header-source__label">{fuenteActiva.label}</span>
            <span className="header-source__sub">{fuenteActiva.sub}</span>
          </div>
          <ChevronDown size={11} style={{ color: 'var(--text-faint)' }} />
        </button>

        {dropdownOpen && (
          <div className="source-dropdown" style={{ position: 'relative' }}>
            {FUENTES.map(({ id, label, sub, Icon, note, badge }) => (
              <button
                key={id}
                className={`source-dropdown__item ${id === source ? 'is-active' : ''}`}
                onClick={() => seleccionarFuente(id)}
                onMouseEnter={() => setHoveredSource(id)}
                onMouseLeave={() => setHoveredSource(null)}
                data-source={id}
              >
                <div className="source-dropdown__icon"><Icon size={14} /></div>

                <div className="source-dropdown__text">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    <span className="source-dropdown__label">{label}</span>
                    {badge && <Badge text={badge} />}
                  </span>
                  <span className="source-dropdown__note">{note}</span>
                </div>

                {id === source && <div className="source-dropdown__check">✓</div>}

                {id === 'system' && (
                  <SystemAudioTooltip visible={hoveredSource === 'system'} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Play / Stop ────────────────────────────────────────── */}
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

      {/* ── Waveform + Timer ───────────────────────────────────── */}
      <div className="header-wave-block no-drag">
        <span className="header-timer">{timer}</span>
        <Waveform active={playing} />
      </div>

      {/* ── CENTRAL: Controles de Idioma (NUEVO) ───────────────── */}
      <div className="header-lang-controls no-drag" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto', marginRight: '16px' }}>
        
        {/* Toggle Auto/Manual */}
        <button
          className={`header-icon-btn ${isAutoMode ? 'is-active' : ''}`}
          onClick={onToggleAutoMode}
          title={isAutoMode ? 'Modo Automático activo. Clic para Manual.' : 'Modo Manual activo. Clic para Auto.'}
          style={{ padding: '4px 10px', borderRadius: '6px', display: 'flex', gap: '6px' }}
        >
          {isAutoMode ? <Bot size={14} /> : <Zap size={14} />}
          <span style={{ fontSize: '11px', fontWeight: 600 }}>{isAutoMode ? 'Auto' : 'Manual'}</span>
        </button>

        {/* Switch Manual (Solo visible si NO es auto) */}
        {!isAutoMode && (
          <button
            onClick={onToggleLanguage}
            title="Atajo: Ctrl + Espacio"
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid var(--border)',
              background: activeLangUI === 'en-US' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: activeLangUI === 'en-US' ? '#3b82f6' : '#ef4444',
              transition: 'all 0.2s',
              minWidth: '90px'
            }}
          >
            {activeLangUI === 'en-US' ? '🇺🇸 INGLÉS' : '🇪🇸 ESPAÑOL'}
          </button>
        )}
      </div>

      {/* ── Controles derecha ──────────────────────────────────── */}
      <div className="header-right no-drag">

        <button
          className={`header-icon-btn header-subtitle-toggle ${subtitleOnly ? 'is-active' : ''}`}
          onClick={onToggleSubtitleOnly}
          title={subtitleOnly
            ? 'Modo subtítulos activo — clic para activar traducción'
            : 'Modo traducción activo — clic para solo subtítulos'
          }
        >
          {subtitleOnly
            ? <Captions  size={15} />
            : <Languages size={15} />
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

        {/* Log out */}
        <button className="log-out-button" onClick={handleLogout} title="Cerrar sesión">
          Log out
        </button>

      </div>
    </header>
  )
}