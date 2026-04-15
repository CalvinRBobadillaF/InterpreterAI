/**
 * components/Header.jsx
 */

import { useState, useEffect, useRef } from 'react'
import {
  Play, Square, ChevronRight, ChevronDown,
  Mic, Monitor, Globe, Sun, Moon, Settings,
} from 'lucide-react'

// ── Waveform ────────────────────────────────────────────────────────
const BAR_COUNT = 72
// Pre-computed heights — pseudo-random via trig
const BAR_HEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const v = Math.abs(Math.sin(i * 0.47) * 0.5 + Math.sin(i * 0.11) * 0.5)
  return Math.round(3 + v * 14)
})

const handleElectronAudio = async () => {
  try {
    if (!window.electronAPI) {
      console.error('❌ Not running inside Electron')
      return
    }

    const source = await window.electronAPI.getAudioSource()

    if (!source) {
      console.error('❌ No source received')
      return
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id
        }
      },
      video: false
    })

    console.log('✅ System audio stream:', stream)

  } catch (err) {
    console.error('❌ Could not capture system audio:', err)
  }
}

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

// ── Timer ────────────────────────────────────────────────────────────
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

// ── Source options ────────────────────────────────────────────────────
const SOURCES = [
  {
    id:    'mic',
    label: 'Microphone',
    sub:   'Default input',
    Icon:  Mic,
    note:  'Works immediately with Web Speech API',
  },
  {
    id:    'tab',
    label: 'Browser Tab',
    sub:   'Tab / screen',
    Icon:  Globe,
    note:  'Pick a tab in the share dialog',
  },
]

// ── Header component ─────────────────────────────────────────────────
export function Header({ playing, onTogglePlay, source, onSourceChange }) {
  const timer = useTimer(playing)

  // ── Theme ──
  const [lightTheme, setLightTheme] = useState(
    () => localStorage.getItem('theme') === 'light'
  )
  useEffect(() => {
    document.documentElement.classList.toggle('light', lightTheme)
    localStorage.setItem('theme', lightTheme ? 'light' : 'dark')
  }, [lightTheme])

  // ── Source dropdown ──
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)
  const activeSource = SOURCES.find(s => s.id === source) || SOURCES[0]

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectSource = (id) => {
    onSourceChange?.(id)
    setDropdownOpen(false)
  }

  return (
    <header className="app-header drag">
        

      {/* Brand */}
      <span className="header-brand__title no-drag">Interpreter AI</span>

      {/* Source selector */}
      <div className="header-source-wrap no-drag" ref={dropdownRef}>
        <button
          className="header-source"
          onClick={() => !playing && setDropdownOpen(o => !o)}
          title={playing ? 'Stop playback to change source' : 'Select audio source'}
          disabled={playing}
        >
          <activeSource.Icon size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <div className="header-source__lines">
            <span className="header-source__label">{activeSource.label}</span>
            <span className="header-source__sub">{activeSource.sub}</span>
          </div>
          <ChevronDown size={11} style={{ color: 'var(--text-faint)' }} />
        </button>

        {dropdownOpen && (
          <div className="source-dropdown">
            {SOURCES.map(({ id, label, sub, Icon, note }) => (
              <button
                key={id}
                className={`source-dropdown__item ${id === source ? 'is-active' : ''}`}
                onClick={() => selectSource(id)}
              >
                <div className="source-dropdown__icon">
                  <Icon size={14} />
                </div>
                <div className="source-dropdown__text">
                  <span className="source-dropdown__label">{label}</span>
                  <span className="source-dropdown__note">{note}</span>
                </div>
                {id === source && (
                  <div className="source-dropdown__check">✓</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Play / Stop */}
      <button
        className={`header-play no-drag ${playing ? 'is-playing' : ''}`}
        onClick={async () => {
  if (source === 'electron') {
    await handleElectronAudio()
  }

  onTogglePlay()
}}
        title={playing ? 'Stop' : 'Start'}
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

      {/* Right controls */}
      <div className="header-right no-drag">
        {/* Theme toggle */}
        <button
          className="header-icon-btn"
          onClick={() => setLightTheme(t => !t)}
          title="Toggle theme"
        >
          {lightTheme ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        
        {/* name */}
      <span className='userName'>
            {localStorage.getItem('app_name') || 'Guest'}
          </span>
          <button 
          className="log-out-button"
          onClick={() => {
            // 1. Borrar TODAS las credenciales
            localStorage.removeItem('app_name')
            localStorage.removeItem('app_key')
            localStorage.removeItem('deepl_key') // ⬅️ ¡Esta línea faltaba!
            
            // 2. Recargar la ventana para forzar a App.jsx a mostrar el LogIn
            window.location.reload()
          }}
          title="Log out and clear data"
        >
          Log out
        </button>
      </div>
    </header>
  )
}


/*

,
  {
    id:    'electron',
    label: 'System Audio',
    sub:   'Desktop capture',
    Icon:  Monitor,
    note:  'Electron only — captures computer audio',
  },8*/