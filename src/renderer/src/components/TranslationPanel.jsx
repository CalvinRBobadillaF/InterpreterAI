/**
 * components/TranslationPanel.jsx
 *
 * ESTRUCTURA VISUAL:
 *   ┌──────────────────────────────────┐
 *   │ Header: EN → ES   [spinner][🗑] │
 *   ├──────────────────────────────────┤
 *   │ Etiqueta "EN"                    │
 *   │ [burbuja] Hola, ¿cómo estás?     │  ← texto original / subtítulos
 *   │ [burbuja parpadeante] interim... │
 *   ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  ┤  ← divisor
 *   │ Etiqueta "ES"                    │
 *   │ [burbuja] Hola, how are you?     │  ← traducción
 *   └──────────────────────────────────┘
 *
 * AUTO-SCROLL: useEffect observa cambios en text/interimText y
 * hace scroll al div invisible al final de la lista.
 *
 * BURBUJAS: cada \n\n en el texto crea una burbuja nueva.
 */

import { useEffect, useRef } from 'react'
import { Loader2, Trash2 } from 'lucide-react'


// ── Componente: lista de burbujas ─────────────────────────────────
// Usado tanto para texto original como para traducción.
function BubbleList({ text, interimText, placeholder, variant }) {
  const anclaRef = useRef(null)

  // Auto-scroll al fondo cada vez que cambia el contenido
  useEffect(() => {
    anclaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [text, interimText])

  // Dividimos el texto en párrafos — cada doble salto = burbuja nueva
  const parrafos = text
    ? text.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
    : []

  const hayContenido = parrafos.length > 0 || !!interimText

  return (
    <div className="bubble-list">
      {!hayContenido && (
        <span className="panel__placeholder">{placeholder}</span>
      )}

      {/* Burbujas de texto confirmado */}
      {parrafos.map((para, i) => (
        <div key={i} className={`bubble bubble--${variant}`}>
          {para}
        </div>
      ))}

      {/* Burbuja provisional con cursor parpadeante */}
      {interimText && (
        <div className={`bubble bubble--${variant} bubble--interim`}>
          {interimText}
          <span className="bubble__cursor" />
        </div>
      )}

      {/* Ancla invisible — scrollIntoView apunta aquí */}
      <div ref={anclaRef} style={{ height: 1 }} />
    </div>
  )
}


// ── Componente principal: TranslationPanel ────────────────────────
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
}) {
  return (
    <div className="panel">

      {/* ── Encabezado ──────────────────────────────────── */}
      <div className="panel__header">
        <div className="panel__lang-selector">
          <span className="panel__lang-text">{fromLang}</span>
          <span className="panel__lang-arrow">→</span>
          <span className="panel__lang-text">{toLang}</span>
        </div>

        <div className="panel__actions">
          {/* Spinner de traducción en progreso */}
          {loading && (
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

      {/* ── Cuerpo dividido en dos mitades ──────────────── */}
      <div className="panel__body panel__body--split">

        {/* MITAD SUPERIOR: subtítulos originales */}
        <div className="panel__half panel__half--top">
          <div className="panel__half-label">{fromLang}</div>

          {readOnly ? (
            // Panel de solo lectura: muestra burbujas directamente
            <BubbleList
              text={value}
              interimText={interimText}
              placeholder={placeholder || 'Los subtítulos aparecerán aquí...'}
              variant="source"
            />
          ) : (
            // Panel editable: si hay texto muestra burbujas, si no muestra textarea
            <div className="bubble-list bubble-list--editable">
              {value.trim() || interimText ? (
                // Hay contenido → renderizamos burbujas (el usuario puede borrar con el ícono)
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
                // Panel vacío → mostramos el textarea para que el usuario pueda escribir
                <textarea
                  className="panel__textarea panel__textarea--ghost"
                  placeholder={placeholder}
                  value={value}
                  onChange={onChange}
                  spellCheck={false}
                />
              )}
              {/* Ancla de auto-scroll */}
              <AutoScrollAncla dep1={value} dep2={interimText} />
            </div>
          )}
        </div>

        {/* Línea divisora */}
        <div className="panel__half-divider" />

        {/* MITAD INFERIOR: traducción */}
        <div className="panel__half panel__half--bottom">
          <div className="panel__half-label">{toLang}</div>
          <BubbleList
            text={translated}
            interimText=""
            placeholder="La traducción aparecerá aquí..."
            variant="translated"
          />
        </div>

      </div>
    </div>
  )
}


// ── Helper: ancla de auto-scroll ──────────────────────────────────
// Componente mínimo que hace scroll a sí mismo cuando cambian sus dependencias.
function AutoScrollAncla({ dep1, dep2 }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [dep1, dep2])
  return <div ref={ref} style={{ height: 1 }} />
}
