/**
 * hooks/useTranslation.js
 * ─────────────────────────────────────────────────────────────────
 * WHY IPC:
 *   DeepL rejects fetch() calls from Electron's renderer process due to
 *   CORS restrictions. The solution is to route the HTTP request through
 *   the main process via IPC — main process uses Electron's `net` module
 *   which has no CORS restrictions.
 *
 * KEY STORAGE:
 *   The DeepL key is stored as 'deepl_key' in localStorage (set in LogIn).
 *   The Deepgram key is stored separately as 'app_key'.
 * ─────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const IS_ELECTRON = !!window.electronAPI?.isElectron

// ── Core translate function ────────────────────────────────────────
async function callTranslate({ text, from, to, apiKey }) {
  const clean = text?.trim();
  if (!clean || !apiKey) return clean || '';

  if (IS_ELECTRON) {
    try {
      // ⚠️ ASEGÚRATE de que en tu preload.js el nombre sea 'translate'
      // o cámbialo aquí al nombre que tengas en el preload.
      const result = await window.electronAPI.translate({ text: clean, from, to, apiKey });
      return result || clean;
    } catch (e) {
      console.error('[Translation] IPC error:', e);
      return clean;
    }
  } else {
    // 🌐 WEB FALLBACK (Aquí es donde el CSP suele molestar)
    const url = `https://api-free.deepl.com/v2/translate`;
    const body = new URLSearchParams({
      auth_key: apiKey,
      text: clean,
      source_lang: from.toUpperCase(),
      target_lang: to.toUpperCase() === 'EN' ? 'EN-US' : to.toUpperCase(),
    });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = await res.json();
      return data?.translations?.[0]?.text || clean;
    } catch (e) {
      // Si ves este error en la web, es el CSP bloqueando el fetch
      console.error('[Translation] Web Fetch blocked by CSP or CORS', e);
      return clean;
    }
  }
}
// ── useTranslation ────────────────────────────────────────────────
export function useTranslation({ from = 'en', to = 'es' } = {}) {
  const cacheRef = useRef(new Map())

  const translate = useCallback(async (text) => {
    const clean = text?.trim()
    if (!clean) return ''

    // Read key fresh each call (user may have just logged in)
    const apiKey = localStorage.getItem('deepl_key') || ''
    if (!apiKey) {
      console.warn('[Translation] deepl_key not found in localStorage')
      return clean
    }

    const cacheKey = `${from}|${to}:${clean}`
    if (cacheRef.current.has(cacheKey)) return cacheRef.current.get(cacheKey)

    const result = await callTranslate({ text: clean, from, to, apiKey })
    if (result && result !== clean) cacheRef.current.set(cacheKey, result)
    return result
  }, [from, to])

  return { translate }
}

// ── useAutoTranslation ─────────────────────────────────────────────
// Watches sourceText and auto-translates with debounce.
export function useAutoTranslation(sourceText, {
  from       = 'en',
  to         = 'es',
  debounceMs = 600,
} = {}) {
  const { translate }             = useTranslation({ from, to })
  const [result, setResult]       = useState('')
  const [translating, setTranslating] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!sourceText?.trim()) {
      setResult('')
      return
    }

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
