/**
 * components/ConversationView.jsx
 *
 * Diseño idéntico a la imagen de referencia:
 * - Fondo negro, cards rectangulares con bordes sutiles
 * - Dos columnas: original izquierda, traducción derecha
 * - Texto normal en original, semi-bold en traducción
 * - Timestamp pequeño en la esquina inferior derecha de cada card
 * - Gaps amplios entre utterances (como la imagen)
 */

import { useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'

const fmtTime = (date) =>
  date instanceof Date
    ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''

function Dots() {
  return (
    <div className="cv-dots" aria-label="Translating…">
      <span /><span /><span />
    </div>
  )
}

export function ConversationView({
  utterances   = [],
  interimText  = '',
  interimLang  = 'en',
  subtitleOnly = false,
  playing      = false,
  onClear,
}) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [utterances.length, interimText])

  const isEmpty = utterances.length === 0 && !interimText

  return (
    <div className="cv-root">

      {/* ── Barra de columnas ─────────────────────────────────── */}
      <div className="cv-toolbar">
        <span className="cv-toolbar-col">Original</span>
        {!subtitleOnly && <span className="cv-toolbar-col">Translation</span>}
        <button className="cv-clear-btn" onClick={onClear} title="Clear conversation">
          <Trash2 size={12} />
        </button>
      </div>

      {/* ── Área scrollable ───────────────────────────────────── */}
      <div className="cv-scroll">

        {isEmpty && (
          <p className="cv-empty">
            {playing ? 'Listening…' : 'Press ▶ to start'}
          </p>
        )}

        {/* Utterances finalizados */}
        {utterances.map((u) => (
          <div
            key={u.id}
            className={`cv-row ${subtitleOnly ? 'cv-row--solo' : ''}`}
          >
            {/* Original */}
            <div className="cv-card cv-card--orig">
              <p className="cv-text">{u.text}</p>
              {u.timestamp && (
                <time className="cv-timestamp">{fmtTime(u.timestamp)}</time>
              )}
            </div>

            {/* Traducción */}
            {!subtitleOnly && (
              <div className="cv-card cv-card--trans">
                {u.translating ? (
                  <Dots />
                ) : u.translation ? (
                  <>
                    <p className="cv-text cv-text--trans">{u.translation}</p>
                    {u.timestamp && (
                      <time className="cv-timestamp">{fmtTime(u.timestamp)}</time>
                    )}
                  </>
                ) : (
                  <span className="cv-dash">—</span>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Interim (en vivo) */}
        {interimText && (
          <div className={`cv-row cv-row--live ${subtitleOnly ? 'cv-row--solo' : ''}`}>
            <div className="cv-card cv-card--orig cv-card--live">
              <p className="cv-text">
                {interimText}<span className="cv-cursor" />
              </p>
            </div>
            {!subtitleOnly && (
              <div className="cv-card cv-card--trans cv-card--live" />
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
