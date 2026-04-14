/**
 * hooks/useTranslation.js
 * ─────────────────────────────────────────────────────────────────
 * Automatic translation using the MyMemory API.
 *
 * FREE TIER LIMITS:
 *   - 5,000 characters/day without an email
 *   - 10,000 characters/day if you add ?de=youremail@domain.com
 *   - No API key required for basic usage
 *
 * For production use, replace with DeepL, Google Translate, or LibreTranslate.
 *
 * FEATURES:
 *   - Translation cache (avoids re-translating the same text)
 *   - Debounced auto-translate (waits for a pause before firing)
 *   - Manual translate() function for on-demand calls
 * ─────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const MYMEMORY = 'https://api.mymemory.translated.net/get'

// Optional: add your email to increase daily limit
// const EMAIL = 'your@email.com'

export function useTranslation({ from = 'en', to = 'es' } = {}) {
  const cacheRef    = useRef(new Map())
  const controllerRef = useRef(null)

  // ── Core translate function ──
  const translate = useCallback(async (text) => {
    const clean = text?.trim()
    if (!clean) return ''

    // Check cache
    const key = `${from}|${to}:${clean}`
    if (cacheRef.current.has(key)) return cacheRef.current.get(key)

    // Cancel previous in-flight request
    controllerRef.current?.abort()
    controllerRef.current = new AbortController()

    try {
      const url = `${MYMEMORY}?q=${encodeURIComponent(clean)}&langpair=${from}|${to}`
      const res  = await fetch(url, { signal: controllerRef.current.signal })
      const data = await res.json()

      if (data.responseStatus === 200) {
        const result = data.responseData.translatedText
        cacheRef.current.set(key, result)
        return result
      }

      console.warn('[Translation] API error:', data.responseStatus, data.responseDetails)
      return clean

    } catch (e) {
      if (e.name === 'AbortError') return '' // request was cancelled, not an error
      console.warn('[Translation] fetch error:', e)
      return clean
    }
  }, [from, to])

  return { translate }
}

/**
 * useAutoTranslation
 * ─────────────────────────────────────────────────────────────────
 * Watches `sourceText` and auto-translates it with a debounce delay.
 * Use this in App.jsx to auto-translate transcription output.
 *
 * @param {string}  sourceText - text to translate (e.g. transcription)
 * @param {object}  options    - { from, to, debounceMs }
 * @returns {{ translatedText, translating }}
 */
export function useAutoTranslation(sourceText, {
  from = 'en',
  to   = 'es',
  debounceMs = 600,
} = {}) {
  const { translate }    = useTranslation({ from, to })
  const [result,      setResult]      = useState('')
  const [translating, setTranslating] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!sourceText?.trim()) { setResult(''); return }

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setTranslating(true)
      const translated = await translate(sourceText)
      setResult(translated)
      setTranslating(false)
    }, debounceMs)

    return () => clearTimeout(timerRef.current)
  }, [sourceText, translate, debounceMs])

  return { translatedText: result, translating }
}
