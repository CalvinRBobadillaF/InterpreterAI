/**
 * components/ConversationView.jsx
 *
 * Layout: dos columnas sincronizadas
 *   Izquierda → texto original (cualquier idioma, detectado automáticamente)
 *   Derecha    → traducción correspondiente
 */

import { useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'

function TranslatingDots() {
  return (
    <div className="cv-dots">
      <span /><span /><span />
    </div>
  )
}

export function ConversationView({
  utterances         = [],
  interimText        = '',
  interimLang        = 'en',
  interimTranslation = '',
  subtitleOnly       = false,
  playing            = false,
  onClear,
}) {
  const bottomRef = useRef(null)

  // Auto-scroll al fondo cuando hay nuevo texto o traducción
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [utterances.length, interimText, interimTranslation])

  const isEmpty = utterances.length === 0 && !interimText

  return (
    <div className="cv-root">
      <div className="cv-col-header">
        <div className="cv-col-title">Original</div>
        {!subtitleOnly && <div className="cv-col-title">Translation</div>}
        <button className="cv-clear-btn" onClick={onClear} title="Clear all">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="cv-scroll">
        {isEmpty && (
          <div className="cv-empty">
            {playing ? 'Listening…' : 'Press ▶ to start'}
          </div>
        )}

        {/* ── HISTORIAL DE MENSAJES (FINALIZADOS) ── */}
        {utterances.map((u) => (
          <div key={u.id} className={`cv-row ${subtitleOnly ? 'cv-row--single' : ''}`}>
            <div className={`cv-card cv-card--${u.lang}`}>
              <span className="cv-lang-tag">{u.lang === 'en' ? 'EN' : 'ES'}</span>
              <p className="cv-card-text">{u.text}</p>
            </div>

            {!subtitleOnly && (
              <div className="cv-card cv-card--translated">
                {u.translating ? (
                  <TranslatingDots />
                ) : u.translation ? (
                  <>
                    <span className="cv-lang-tag cv-lang-tag--alt">
                      {u.lang === 'en' ? 'ES' : 'EN'}
                    </span>
                    <p className="cv-card-text">{u.translation}</p>
                  </>
                ) : (
                  <p className="cv-card-text cv-card-text--empty">—</p>
                )}
              </div>
            )}
          </div>
        ))}

        {/* ── TEXTO EN VIVO (INTERIM) ── */}
        {interimText && (
          <div className={`cv-row ${subtitleOnly ? 'cv-row--single' : ''}`}>
            
            {/* Tarjeta Izquierda (Original en vivo) */}
            <div className={`cv-card cv-card--${interimLang} cv-card--interim`}>
              <span className="cv-lang-tag">{interimLang === 'en' ? 'EN' : 'ES'}</span>
              <p className="cv-card-text">
                {interimText}<span className="cv-cursor" />
              </p>
            </div>

            {/* Tarjeta Derecha (Traducción en vivo) */}
            {!subtitleOnly && (
              <div className="cv-card cv-card--translated cv-card--interim">
                {interimTranslation ? (
                  <>
                    <span className="cv-lang-tag cv-lang-tag--alt">
                      {interimLang === 'en' ? 'ES' : 'EN'}
                    </span>
                    {/* Añadimos '...' para dar la sensación de que sigue escribiendo */}
                    <p className="cv-card-text">{interimTranslation}...</p> 
                  </>
                ) : (
                  <TranslatingDots />
                )}
              </div>
            )}
          </div>
        )}

        {/* Ancla invisible para el auto-scroll */}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}