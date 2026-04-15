/**
 * components/Footer.jsx
 */

export function Footer({ status = 'Idle', error = null }) {
  return (
    <footer className="app-footer">
      
      <span className="app-footer__text">Interpreter AI release 1.1</span>
        
      <div className="app-footer__status">
        {error ? (
          <span className="app-footer__error">⚠ {error}</span>
        ) : (
          <span className={`app-footer__state ${status !== 'Idle' ? 'is-active' : ''}`}>
            {status !== 'Idle' ? '● ' : '○ '}{status}
          </span>
        )}
      </div>
    </footer>
  )
}
