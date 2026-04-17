/**
 * components/TranslationPanel.jsx
 *
 * NUEVO: prop subtitleOnly
 *   Cuando es true, oculta la mitad inferior (traducción) y expande
 *   la mitad superior (subtítulos) al 100% del panel.
 *   No requiere cambios en el CSS — solo flexbox.
 */

import { useEffect, useRef } from 'react'
import { Loader2, Trash2 } from 'lucide-react'


// ── Lista de burbujas (subtítulos o traducción) ───────────────────
function BubbleList({ text, interimText, placeholder, variant }) {
  const anclaRef = useRef(null)

  // Auto-scroll al fondo cada vez que llega contenido nuevo
  useEffect(() => {
    anclaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [text, interimText])

  const parrafos    = text ? text.split(/\n\n+/).map(p => p.trim()).filter(Boolean) : []
  const hayContenido = parrafos.length > 0 || !!interimText

  return (
    <div className="bubble-list">
      {!hayContenido && (
        <span className="panel__placeholder">{placeholder}</span>
      )}

      {parrafos.map((para, i) => (
        <div key={i} className={`bubble bubble--${variant}`}>{para}</div>
      ))}

      {interimText && (
        <div className={`bubble bubble--${variant} bubble--interim`}>
          {interimText}
          <span className="bubble__cursor" />
        </div>
      )}

      <div ref={anclaRef} style={{ height: 1 }} />
    </div>
  )
}

// ── Ancla de auto-scroll para el panel editable ───────────────────
function AutoScrollAncla({ dep1, dep2 }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [dep1, dep2])
  return <div ref={ref} style={{ height: 1 }} />
}


// ── Componente principal ──────────────────────────────────────────
export function TranslationPanel({
  fromLang,
  toLang,
  placeholder  = '',
  readOnly     = false,
  value        = '',
  translated   = '',
  interimText  = '',
  loading      = false,
  onChange,
  onClear,
  subtitleOnly = false,   // oculta la sección de traducción
}) {
  return (
    <div className="panel">

      {/* Encabezado */}
      <div className="panel__header">
        <div className="panel__lang-selector">
          <span className="panel__lang-text">{fromLang}</span>
          <span className="panel__lang-arrow">→</span>
          <span className="panel__lang-text">{toLang}</span>
        </div>

        <div className="panel__actions">
          {/* Spinner mientras se traduce */}
          {loading && !subtitleOnly && (
            <Loader2
              size={14}
              className="panel__action-btn"
              style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }}
            />
          )}
          <button className="panel__action-btn" title="Limpiar" onClick={onClear}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="panel__body panel__body--split">

        {/* ── MITAD SUPERIOR: subtítulos originales ──────────── */}
        {/* flex: 1 siempre; si subtitleOnly, ocupa todo el espacio */}
        <div
          className="panel__half panel__half--top"
          style={{ flex: subtitleOnly ? 1 : undefined }}
        >
          <div className="panel__half-label">{fromLang}</div>

          {readOnly ? (
            <BubbleList
              text={value}
              interimText={interimText}
              placeholder={placeholder || 'Los subtítulos aparecerán aquí...'}
              variant="source"
            />
          ) : (
            <div className="bubble-list bubble-list--editable">
              {value.trim() || interimText ? (
                <>
                  {value.split(/\n\n+/).map(p => p.trim()).filter(Boolean).map((para, i) => (
                    <div key={i} className="bubble bubble--source">{para}</div>
                  ))}
                  {interimText && (
                    <div className="bubble bubble--source bubble--interim">
                      {interimText}<span className="bubble__cursor" />
                    </div>
                  )}
                </>
              ) : (
                <textarea
                  className="panel__textarea panel__textarea--ghost"
                  placeholder={placeholder}
                  value={value}
                  onChange={onChange}
                  spellCheck={false}
                />
              )}
              <AutoScrollAncla dep1={value} dep2={interimText} />
            </div>
          )}
        </div>

        {/* ── Divisor y MITAD INFERIOR: solo si hay traducción ─ */}
        {!subtitleOnly && (
          <>
            <div className="panel__half-divider" />

            <div className="panel__half panel__half--bottom">
              <div className="panel__half-label">{toLang}</div>
              <BubbleList
                text={translated}
                interimText=""
                placeholder="La traducción aparecerá aquí..."
                variant="translated"
              />
            </div>
          </>
        )}

      </div>
    </div>
  )
}
