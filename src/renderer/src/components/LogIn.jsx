/**
 * components/LogIn.jsx
 * ─────────────────────────────────────────────────────────────────
 * Saves two keys to localStorage:
 *   app_key   → Deepgram API key  (speech-to-text)
 *   deepl_key → DeepL API key     (translation)
 *   app_name  → user display name
 * ─────────────────────────────────────────────────────────────────
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import '../assets/login.css'

export function LogIn({ onLogin }) {
  const [name, setName] = useState('')
  const [deepgramKey, setDeepgramKey] = useState(localStorage.getItem('app_key') || '')
  const [deeplKey, setDeeplKey] = useState(localStorage.getItem('deepl_key') || '')
  const [error, setError] = useState('')
  
  // Estado para el toggle de instrucciones del componente original
  const [showInstructions, setShowInstructions] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Please enter your name.')
      return
    }
    if (!deepgramKey.trim()) {
      setError('Deepgram API key is required for transcription.')
      return
    }
    if (!deeplKey.trim()) {
      setError('DeepL API key is required for translation.')
      return
    }

    localStorage.setItem('app_name', name.trim())
    localStorage.setItem('app_key', deepgramKey.trim())
    localStorage.setItem('deepl_key', deeplKey.trim())

    onLogin()
  }

  return (
    <div className="login-shell">
      <div className="login-card">

        {/* Brand */}
        <div className="login-brand">
          <div className="login-brand__dot" />
          <span className="login-brand__title">Interpreter AI</span>
        </div>

        <p className="login-subtitle">
          Enter your API keys to get started. Keys are stored locally and never sent to our servers.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>

          {/* Name */}
          <div className="login-field">
            <label className="login-label">Your Name</label>
            <input
              className="login-input"
              type="text"
              placeholder="e.g. Maria López"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Deepgram */}
          <div className="login-field">
            <label className="login-label">
              Deepgram API Key
              <a
                className="login-label__link"
                href="https://console.deepgram.com"
                target="_blank"
                rel="noreferrer"
              >
                Get free key →
              </a>
            </label>
            <input
              className="login-input login-input--mono"
              type="password"
              placeholder="deepgram_xxxxxxxxxxxxxxxxxxxxxxxx"
              value={deepgramKey}
              onChange={e => setDeepgramKey(e.target.value)}
            />
            <span className="login-hint">Used for real-time speech-to-text (12,000 min/year free)</span>
          </div>

          {/* DeepL */}
          <div className="login-field">
            <label className="login-label">
              DeepL API Key
              <a
                className="login-label__link"
                href="https://www.deepl.com/pro-api"
                target="_blank"
                rel="noreferrer"
              >
                Get free key →
              </a>
            </label>
            <input
              className="login-input login-input--mono"
              type="password"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
              value={deeplKey}
              onChange={e => setDeeplKey(e.target.value)}
            />
            <span className="login-hint">Used for translation (500,000 chars/month free)</span>
          </div>

          {/* Instructions Toggle (Mantenido de la versión 1) */}
          <div className="login-instructions">
            <button 
              type="button" 
              onClick={() => setShowInstructions(!showInstructions)}
              className="instructions-toggle"
            >
              {showInstructions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              How to get access?
            </button>
            
            <div className={`instructions-content ${showInstructions ? 'is-open' : ''}`}>
              <p>
                Enter your name and both API keys.
                <br /><br />
                1. <strong>Deepgram:</strong> For high-speed transcription.
                <br />
                2. <strong>DeepL:</strong> For professional translation accuracy.
                <br /><br />
                Ask Calvin Bobadilla for credentials if needed.
              </p>
            </div>
          </div>

          {error && (
            <div className="login-error">⚠ {error}</div>
          )}

          <button className="login-btn" type="submit">
            Start Interpreting
          </button>

        </form>

        {/* Credits (Mantenido de la versión 1) */}
        <div className="login-credits">
          Developed by{' '}
          <a href="https://github.com/CalvinRBobadillaF" target="_blank" rel="noreferrer">
            Calvin Rafael Bobadilla Fernandez
          </a>
        </div>

      </div>
    </div>
  )
}