/**
 * components/Header.jsx
 *
 * Fuentes de audio disponibles:
 *  - mic  → Micrófono del dispositivo
 *  - tab  → Pestaña del navegador (getDisplayMedia)
 *  - system → Audio del sistema/PC completo (getDisplayMedia con preferencia de pantalla)
 *
 * El botón de subtítulos/traducción alterna `subtitleOnly` en App.jsx.
 * Cuando subtitleOnly===true, App.jsx pasa sourceText='' a useAutoTranslation
 * → el hook hace early-return antes de cualquier fetch → 0 tokens de DeepL gastados.
 */
import { useState, useEffect, useRef } from 'react'
import {
  Play, Square, ChevronDown,
  Mic, Globe, Sun, Moon, Captions, Languages, Monitor,
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
// 'system' usa getDisplayMedia igual que 'tab' pero con preferenceDisplaySurface:'monitor'
// para que el diálogo del SO abra directamente en "Toda la pantalla" y capture
// el audio del sistema (loopback). El soporte real depende del SO y el navegador:
//   ✅ Windows + Chrome/Edge  → audio del sistema disponible
//   ⚠️ macOS                 → requiere extensión/driver virtual (BlackHole, Loopback…)
//   ❌ Linux                  → generalmente no soportado sin PulseAudio loopback
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
  /*
  {
    id:    'system',
    label: 'System Audio',
    sub:   'PC / whole screen',
    Icon:  Monitor,
    // Nota visible en el dropdown para que el usuario sepa la limitación
    note:  'Audio del sistema completo (Windows/Chrome recomendado)',
    // Badge informativo — no bloquea la selección
    badge: 'Beta',
  }, */
]

// ─────────────────────────────────────────────────────────────────
// Badge pequeño que se muestra junto al label en el dropdown
// ─────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────
// Tooltip de soporte por SO — aparece al hacer hover sobre el ítem
// de System Audio para orientar al usuario sin bloquear la acción
// ─────────────────────────────────────────────────────────────────
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
        // Se posiciona a la derecha del dropdown
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
  // Cuál ítem tiene el hover (para el tooltip de soporte)
  const [hoveredSource, setHoveredSource] = useState(null)

  const dropdownRef  = useRef(null)
  const fuenteActiva = FUENTES.find(f => f.id === source) || FUENTES[0]

  // Cierra el dropdown al hacer clic fuera
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

  // ── Selección de fuente ──────────────────────────────────────
  // Para 'system' intentamos verificar si el navegador soporta
  // getDisplayMedia antes de confirmar la selección. Si no, avisamos
  // pero igual permitimos seleccionarlo (el hook de captura decide).
  const seleccionarFuente = (id) => {
    if (id === 'system') {
      // getDisplayMedia no está disponible en HTTP sin localhost
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
          /*
           * `position: relative` en el dropdown para que el tooltip
           * de SystemAudio pueda posicionarse con left: 100%
           */
          <div className="source-dropdown" style={{ position: 'relative' }}>
            {FUENTES.map(({ id, label, sub, Icon, note, badge }) => (
              <button
                key={id}
                className={`source-dropdown__item ${id === source ? 'is-active' : ''}`}
                onClick={() => seleccionarFuente(id)}
                onMouseEnter={() => setHoveredSource(id)}
                onMouseLeave={() => setHoveredSource(null)}
                /*
                 * Atributo data para CSS opcional:
                 *   [data-source="system"] { border-top: 1px solid var(--border) }
                 */
                data-source={id}
              >
                <div className="source-dropdown__icon"><Icon size={14} /></div>

                <div className="source-dropdown__text">
                  {/* Label + badge en la misma fila */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    <span className="source-dropdown__label">{label}</span>
                    {badge && <Badge text={badge} />}
                  </span>
                  <span className="source-dropdown__note">{note}</span>
                </div>

                {id === source && <div className="source-dropdown__check">✓</div>}

                {/* Tooltip de soporte solo para System Audio */}
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

      {/* ── Controles derecha ──────────────────────────────────── */}
      <div className="header-right no-drag">

        {/*
          BOTÓN SOLO SUBTÍTULOS / TRADUCCIÓN
          ─────────────────────────────────────────────────────────
          Al activar modo subtítulos:
            1. Este botón cambia su apariencia a "is-active"
            2. App.jsx recibe subtitleOnly=true y pasa '' a useAutoTranslation
            3. useAutoTranslation hace early-return inmediato → 0 tokens gastados
          Al desactivar:
            1. App.jsx pasa el texto real → useAutoTranslation traduce normalmente
          ─────────────────────────────────────────────────────────
        */}
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