/**
 * components/LogIn.jsx
 * ─────────────────────────────────────────────────────────────────
 * Saves keys and info to localStorage:
 * app_key   → Deepgram API key (speech-to-text)
 * app_name  → user display name
 * * NOTE: DeepL key is now managed securely via Backend (FastAPI).
 * ─────────────────────────────────────────────────────────────────
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import '../assets/login.css'

export function LogIn({ onLogin }) {
  const [name, setName] = useState('')
  const [deepgramKey, setDeepgramKey] = useState(localStorage.getItem('app_key') || '')
  const [error, setError] = useState('')
  
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

    // Guardamos solo lo necesario localmente
    localStorage.setItem('app_name', name.trim())
    localStorage.setItem('app_key', deepgramKey.trim())

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
          Welcome! Enter your name and Deepgram key to start transcribing. 
          <br />
          <span style={{ fontSize: '0.85em', opacity: 0.8 }}>Professional translation is now automatically enabled.</span>
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

          {/* Instructions Toggle */}
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
                1. <strong>Deepgram:</strong> For high-speed transcription. Get your own key at their console.
                <br /><br />
                2. <strong>DeepL:</strong> Integrated via secure backend. No key required from the user.
                <br /><br />
                Ask Calvin Bobadilla if you need help with credentials.
              </p>
            </div>
          </div>

          {error && (
            <div className="login-error">⚠ {error}</div>
          )}

          <button className="login-btn" type="submit">
            Log in
          </button>

        </form>

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