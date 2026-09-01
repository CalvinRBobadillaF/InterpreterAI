/**
 * components/ConversationView.jsx
 *
 * CAMBIOS para Gladia (ahora hay 3 idiomas de origen posibles, y el
 * idioma de traducción varía según el caso — ya no es un valor fijo):
 * - Se agregó una bandera pequeñita junto al timestamp (no una pastilla
 *   separada arriba del texto, que era lo que se veía forzado antes).
 *   Formato: "🇭🇹 · 14:32" — discreto, no compite con el texto.
 * - La columna de traducción ahora dice "Translation" genérico en vez
 *   de un idioma fijo, porque el destino cambia según quién habla.
 *
 * (Se mantiene: auto-scroll inteligente, botón "Jump to latest", retry
 * de traducciones fallidas, puntitos mientras se traduce.)
 */

import { useEffect, useRef, useState } from 'react'
import { Trash2, RefreshCw, ArrowDown } from 'lucide-react'

const FLAGS = { en: '🇺🇸', es: '🇪🇸', ht: '🇭🇹' }

const fmtTime = (date) =>
  date instanceof Date
    ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''

function MetaLine({ lang, timestamp }) {
  if (!timestamp) return null
  return (
    <time className="cv-timestamp">
      {FLAGS[lang] ? `${FLAGS[lang]} · ` : ''}{fmtTime(timestamp)}
    </time>
  )
}

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

  return (
    <div className="cv-root">

      <div className="cv-toolbar">
        <span className="cv-toolbar-col">Original</span>
        {!subtitleOnly && <span className="cv-toolbar-col">Translation</span>}
        <button className="cv-clear-btn" onClick={onClear} title="Clear conversation">
          <Trash2 size={12} />
        </button>
      </div>

      <div className="cv-scroll" ref={scrollRef}>

        {isEmpty && (
          <p className="cv-empty">
            {playing ? 'Listening — EN / ES / 🇭🇹 Kreyòl…' : 'Press ▶ to start'}
          </p>
        )}

        {utterances.map((u) => (
          <div key={u.id} className={`cv-row ${subtitleOnly ? 'cv-row--solo' : ''}`}>

            <div className="cv-card cv-card--orig">
              <p className="cv-text">{u.text}</p>
              <MetaLine lang={u.lang} timestamp={u.timestamp} />
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
                    <MetaLine lang={u.targetLang} timestamp={u.timestamp} />
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
