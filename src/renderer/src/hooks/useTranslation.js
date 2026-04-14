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

import { useCallback, useRef, useState, useEffect } from 'react'

// El endpoint cambia si usas el plan Free o Pro
const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate'

export function useTranslation({ from = 'en', to = 'es' } = {}) {
  const cacheRef = useRef(new Map())
  const controllerRef = useRef(null)

  // Recuperamos la API Key que el usuario guardó en el Login
  // Podrías crear un campo específico para DeepL en tu Login 
  // o reutilizar uno por ahora para pruebas.
  const DEEPL_AUTH_KEY = localStorage.getItem('deepl_key') 

  const translate = useCallback(async (text) => {
    const clean = text?.trim()
    if (!clean) return ''

    const key = `${from}|${to}:${clean}`
    if (cacheRef.current.has(key)) return cacheRef.current.get(key)

    controllerRef.current?.abort()
    controllerRef.current = new AbortController()

    if (!DEEPL_AUTH_KEY) {
      console.warn('[DeepL] Missing Auth Key')
      return clean
    }

    try {
      // DeepL requiere los parámetros en el cuerpo o como URLSearchParams
      const params = new URLSearchParams({
        auth_key: DEEPL_AUTH_KEY,
        text: clean,
        source_lang: from.toUpperCase(),
        target_lang: to.toUpperCase() === 'EN' ? 'EN-US' : to.toUpperCase(), // DeepL usa EN-US o EN-GB
      })

      const res = await fetch(DEEPL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: controllerRef.current.signal
      })

      if (!res.ok) {
        throw new Error(`DeepL error: ${res.status}`)
      }

      const data = await res.json()
      const result = data.translations[0].text

      cacheRef.current.set(key, result)
      return result

    } catch (e) {
      if (e.name === 'AbortError') return ''
      console.error('[DeepL] Translation error:', e)
      return clean
    }
  }, [from, to, DEEPL_AUTH_KEY])

  return { translate }
}

// useAutoTranslation se mantiene igual, ya que solo consume 'translate'
export function useAutoTranslation(sourceText, {
  from = 'en',
  to = 'es',
  debounceMs = 600,
} = {}) {
  const { translate } = useTranslation({ from, to })
  const [result, setResult] = useState('')
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