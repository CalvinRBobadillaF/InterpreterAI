import { useState } from 'react'
import { ChevronDown, ChevronUp, MicVocal } from 'lucide-react'
import '../assets/login.css'

export function LogIn({ onLogin }) {
  const [name, setName] = useState('')
  const [deepgramKey, setDeepgramKey] = useState('') // 🔥 Estado separado
  const [deeplKey, setDeeplKey] = useState('')       // 🔥 Estado separado
  const [showInstructions, setShowInstructions] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Validamos que al menos las keys estén presentes
    if (!deepgramKey.trim() || !deeplKey.trim()) {
        alert("Please provide both API keys (Deepgram and DeepL)")
        return
    }

    // Guardar cada dato con su propia etiqueta
    localStorage.setItem('app_name', name.trim() || 'Guest')
    localStorage.setItem('app_key', deepgramKey.trim()) // Llave de Deepgram
    localStorage.setItem('deepl_key', deeplKey.trim())  // Llave de DeepL
    
    // Llamamos a la función de login y recargamos para aplicar cambios
    onLogin()
    window.location.reload()
  }

  return (
    <div className="login-screen">
      <form onSubmit={handleSubmit} className="login-card">
        <div className="login-header">
          <div className="login-icon-container">
            <MicVocal size={24} strokeWidth={1.5} />
          </div>
          <h2>Interpreter AI beta v1.0</h2>
          <p>Sign in to workspace</p>
        </div>
        
        <div className="login-form-body">
          {/* Display Name */}
          <div className="login-field">
            <label>Display Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
            />
          </div>

          {/* Deepgram Key */}
          <div className="login-field">
            <label>Deepgram API Key (STT)</label>
            <input 
              type="password" 
              value={deepgramKey}
              onChange={(e) => setDeepgramKey(e.target.value)}
              placeholder="Deepgram key..."
              required
            />
          </div>

          {/* DeepL Key */}
          <div className="login-field">
            <label>DeepL API Key (Translation)</label>
            <input 
              type="password" 
              value={deeplKey}
              onChange={(e) => setDeeplKey(e.target.value)}
              placeholder="DeepL key..."
              required
            />
          </div>
        </div>

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

        <button type="submit" className="login-submit-btn">
          Continue
        </button>

        <div className="login-credits">
          Developed by{' '}
          <a href="https://github.com/CalvinRBobadillaF" target="_blank" rel="noreferrer">
            Calvin Rafael Bobadilla Fernandez
          </a>
        </div>
      </form>
    </div>
  )
}