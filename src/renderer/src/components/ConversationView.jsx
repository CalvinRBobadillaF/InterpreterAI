/**
 * components/ConversationView.jsx
 *
 * NUEVO en esta versión:
 * - Auto-scroll inteligente: si el usuario se desplaza hacia arriba para
 *   leer el historial, ya NO lo empuja de vuelta al fondo con cada
 *   frase nueva. Solo hace auto-scroll si ya estaba cerca del final.
 * - Botón flotante "↓ Jump to latest" que aparece cuando no estás al
 *   final, para volver con un toque.
 *
 * (Se mantiene de la versión anterior: sin pastilla EN/ES, columna de
 * traducción con etiqueta según htMode.)
 */

import { useEffect, useRef, useState } from 'react'
import { Trash2, RefreshCw, ArrowDown } from 'lucide-react'

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

const NEAR_BOTTOM_THRESHOLD = 80 // px

export function ConversationView({
  utterances   = [],
  interimText  = '',
  interimLang  = 'en',
  subtitleOnly = false,
  htMode       = true,
  playing      = false,
  onClear,
  onRetry,
}) {
  const scrollRef       = useRef(null)
  const bottomRef       = useRef(null)
  const isNearBottomRef = useRef(true)
  const [showJumpBtn, setShowJumpBtn] = useState(false)

  // Detecta si el usuario está cerca del final del scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
      isNearBottomRef.current = near
      setShowJumpBtn(!near)
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto-scroll SOLO si ya estábamos cerca del final
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [utterances.length, interimText])

  const jumpToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    isNearBottomRef.current = true
    setShowJumpBtn(false)
  }

  const isEmpty = utterances.length === 0 && !interimText
  const transColLabel = htMode ? '🇭🇹 Kreyòl' : 'EN ⇄ ES'

  return (
    <div className="cv-root">

      <div className="cv-toolbar">
        <span className="cv-toolbar-col">Original</span>
        {!subtitleOnly && <span className="cv-toolbar-col">{transColLabel}</span>}
        <button className="cv-clear-btn" onClick={onClear} title="Clear conversation">
          <Trash2 size={12} />
        </button>
      </div>

      <div className="cv-scroll" ref={scrollRef}>

        {isEmpty && (
          <p className="cv-empty">
            {playing ? 'Listening…' : 'Press ▶ to start'}
          </p>
        )}

        {utterances.map((u) => (
          <div key={u.id} className={`cv-row ${subtitleOnly ? 'cv-row--solo' : ''}`}>

            <div className="cv-card cv-card--orig">
              <p className="cv-text">{u.text}</p>
              {u.timestamp && <time className="cv-timestamp">{fmtTime(u.timestamp)}</time>}
            </div>

            {!subtitleOnly && (
              <div className="cv-card cv-card--trans">
                {u.translating ? (
                  <Dots />
                ) : u.failed ? (
                  <button className="cv-retry-btn" onClick={() => onRetry?.(u.id)} title="Retry translation">
                    <RefreshCw size={12} />
                    <span>Retry</span>
                  </button>
                ) : u.translation ? (
                  <>
                    <p className="cv-text cv-text--trans">{u.translation}</p>
                    {u.timestamp && <time className="cv-timestamp">{fmtTime(u.timestamp)}</time>}
                  </>
                ) : (
                  <span className="cv-dash">—</span>
                )}
              </div>
            )}
          </div>
        ))}

        {interimText && (
          <div className={`cv-row cv-row--live ${subtitleOnly ? 'cv-row--solo' : ''}`}>
            <div className="cv-card cv-card--orig cv-card--live">
              <p className="cv-text">
                {interimText}<span className="cv-cursor" />
              </p>
            </div>
            {!subtitleOnly && <div className="cv-card cv-card--trans cv-card--live" />}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {showJumpBtn && (
        <button className="cv-jump-btn" onClick={jumpToBottom}>
          <ArrowDown size={13} />
          <span>Jump to latest</span>
        </button>
      )}
    </div>
  )
}
