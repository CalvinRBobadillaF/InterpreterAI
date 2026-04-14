import { useState } from 'react'
import { ChevronDown, ChevronUp, MicVocal } from 'lucide-react'
import '../assets/login.css'

export function LogIn({ onLogin }) {
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    
    if (!name.trim() || !apiKey.trim()) return

    // Guardar en Local Storage
    localStorage.setItem('app_name', name.trim())
    localStorage.setItem('app_key', apiKey.trim())
    
    // Cambiar el estado en App.jsx para mostrar la app principal
    window.location.reload()
    onLogin()
  }

  return (
    <div className="login-screen">
      <form onSubmit={handleSubmit} className="login-card">
        <div className="login-header">
          <div className="login-icon-container">
            <MicVocal size={24} strokeWidth={1.5} />
          </div>
          <h2>Interpreter AI beta v1.0</h2>
          <p>Sign in </p>
        </div>
        
        <div className="login-form-body">
          <div className="login-field">
            <label>Display Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              required
            />
          </div>

          <div className="login-field">
            <label>Deepgram API Key</label>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder=""
              
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
            How i get access?
          </button>
          
          <div className={`instructions-content ${showInstructions ? 'is-open' : ''}`}>
            <p>
              In the first input, enter your name, and in the deepgram api key input, the key that you will use to transcribe and translate.
              If you dont have one, ask Calvin Bobadilla for access or create one.
              
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