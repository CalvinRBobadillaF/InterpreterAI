import { Volume2, MoreHorizontal, ChevronDown, Loader2, Trash2 } from 'lucide-react'

export function TranslationPanel({
  fromLang,
  toLang,
  placeholder,
  readOnly    = false,
  value       = '',
  translated  = '',
  interimText = '',
  loading     = false,
  onChange,
  onClear,
}) {

  const isEnglishPanel = fromLang.toLowerCase().includes('english')

  return (
    <div className="panel">
      <div className="panel__header">
        <div className="panel__lang-selector">
          <span className="panel__lang-text">{fromLang}</span>
          <span className="panel__lang-arrow">→</span>
          <span className="panel__lang-text">{toLang}</span>
        </div>

        <div className="panel__actions">
          {loading && (
            <Loader2
              size={14}
              className="panel__action-btn"
              style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }}
            />
          )}

          <button
            className="panel__action-btn"
            title="Clear text"
            onClick={onClear}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="panel__body">
        <div className="panel__display panel__dual">

          {/* 🔹 ORIGINAL */}
          <div className="panel__section panel__section--source">
            {readOnly ? (
              <>
                {value && (
                  <span className="panel__text--confirmed">
                    {isEnglishPanel ? value : value}
                  </span>
                )}

                {interimText && (
                  <span className="panel__text--interim">
                    {' '}{interimText}
                  </span>
                )}

                {!value && !interimText && (
                  <span className="panel__placeholder">{placeholder}</span>
                )}
              </>
            ) : (
              <>
                <textarea
                  className="panel__textarea"
                  placeholder={placeholder}
                  value={value}
                  onChange={onChange}
                  spellCheck={false}
                  style={{ overflow: 'hidden' }}
                  onInput={(e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = el.scrollHeight + 'px';
                    }
                  }}
                />

                {interimText && (
                  <div className="panel__interim-overlay">
                    {interimText}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 🔹 TRANSLATED */}
          <div className="panel__section panel__section--translated">
            {translated ? (
              <span className="panel__text--translated">
                {translated}
              </span>
            ) : (
              <span className="panel__placeholder">
                Translation will appear here...
              </span>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}