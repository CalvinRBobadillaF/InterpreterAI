/**
 * components/LogIn.jsx
 * ─────────────────────────────────────────────────────────────────
 * Saves keys and info to localStorage:
 * app_key    → Deepgram API key (REQUIRED) — transcripción en vivo de
 *              inglés/español, el pipeline principal, nunca ha fallado
 * app_name   → user display name (REQUIRED)
 * gladia_key → Gladia API key (OPTIONAL) — solo hace falta si vas a usar
 *              el botón "🇭🇹 Kreyòl mic" para capturar audio en criollo
 * google_key → Google Cloud Translation API key (OPTIONAL) — usado por
 *              translateText() para traducir CUALQUIER par que incluya
 *              Kreyòl (ninguna traducción depende ya de Gladia)
 * * NOTE: DeepL key is managed securely via Backend (FastAPI) — cubre
 *   los pares sin Kreyòl (en↔es).
 * ─────────────────────────────────────────────────────────────────
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import '../assets/login.css'

export function LogIn({ onLogin }) {
  const [name, setName] = useState('')
  const [deepgramKey, setDeepgramKey] = useState(localStorage.getItem('app_key') || '')
  const [gladiaKey, setGladiaKey]     = useState(localStorage.getItem('gladia_key') || '')
  const [googleKey, setGoogleKey]     = useState(localStorage.getItem('google_key') || '')
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
      setError('Deepgram API key is required for English/Spanish transcription.')
      return
    }

    localStorage.setItem('app_name', name.trim())
    localStorage.setItem('app_key', deepgramKey.trim())

    if (gladiaKey.trim()) {
      localStorage.setItem('gladia_key', gladiaKey.trim())
    } else {
      localStorage.removeItem('gladia_key')
    }

    if (googleKey.trim()) {
      localStorage.setItem('google_key', googleKey.trim())
    } else {
      localStorage.removeItem('google_key')
    }

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
          <span style={{ fontSize: '0.85em', opacity: 0.8 }}>
            Add Gladia too if you'll capture Haitian Creole speech.
          </span>
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

          {/* Deepgram — vuelve a ser la requerida */}
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
            <span className="login-hint">Used for real-time English/Spanish speech-to-text (12,000 min/year free)</span>
          </div>

          {/* Gladia — nueva, opcional, solo para capturar Kreyòl */}
          <div className="login-field">
            <label className="login-label">
              Gladia API Key <span style={{ fontWeight: 400, opacity: 0.65 }}>(optional)</span>
              <a
                className="login-label__link"
                href="https://app.gladia.io"
                target="_blank"
                rel="noreferrer"
              >
                Get key →
              </a>
            </label>
            <input
              className="login-input login-input--mono"
              type="password"
              placeholder="gladia_xxxxxxxxxxxxxxxxxxxxxxxx"
              value={gladiaKey}
              onChange={e => setGladiaKey(e.target.value)}
            />
            <span className="login-hint">
              Only needed for the "🇭🇹 Kreyòl mic" button — captures someone speaking Haitian Creole
            </span>
          </div>

          {/* Google Translate — opcional, respaldo de traducción */}
          <div className="login-field">
            <label className="login-label">
              Google Translate API Key <span style={{ fontWeight: 400, opacity: 0.65 }}>(optional)</span>
              <a
                className="login-label__link"
                href="https://console.cloud.google.com/apis/library/translate.googleapis.com"
                target="_blank"
                rel="noreferrer"
              >
                Get key →
              </a>
            </label>
            <input
              className="login-input login-input--mono"
              type="password"
              placeholder="AIzaSy..."
              value={googleKey}
              onChange={e => setGoogleKey(e.target.value)}
            />
            <span className="login-hint">
              Needed to translate anything involving Kreyòl Ayisyen — DeepL doesn't support that language
            </span>
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
                1. <strong>Deepgram:</strong> Required. Real-time transcription for English and Spanish.
                <br /><br />
                2. <strong>Gladia:</strong> Optional. Only used by the "🇭🇹 Kreyòl mic" button, to
                capture someone speaking Haitian Creole — Deepgram can't recognize that language.
                <br /><br />
                3. <strong>Google Translate:</strong> Optional. Powers every translation that involves
                Kreyòl, regardless of which mic button captured it.
                <br /><br />
                4. <strong>DeepL:</strong> Integrated via secure backend, handles EN ⇄ ES translation.
                No key required from you.
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
