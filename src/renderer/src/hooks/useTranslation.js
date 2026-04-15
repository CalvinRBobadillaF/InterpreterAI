/**
 * hooks/useTranslation.js
 * ─────────────────────────────────────────────────────────────────
 * ARCHITECTURE:
 * Now uses a secure FastAPI backend on Render to handle DeepL 
 * translations. This protects the API Key and bypasses CORS.
 * * NOTE: 
 * The Deepgram key (app_key) is still kept in localStorage as 
 * requested for the STT service.
 * ─────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const IS_ELECTRON = !!window.electronAPI?.isElectron

// ── Core translate function ────────────────────────────────────────
async function callTranslate({ text, from, to }) {
  const clean = text?.trim();
  if (!clean) return '';

  // 🚀 Tu endpoint oficial en Render
  const url = `https://interpreterbk.onrender.com/api/translate`; 

  if (IS_ELECTRON && window.electronAPI?.translate) {
    try {
      // Si estás en Electron, intenta usar el IPC (si está configurado)
      // De lo contrario, caerá al bloque fetch de abajo.
      const result = await window.electronAPI.translate({ text: clean, from, to });
      if (result) return result;
    } catch (e) {
      console.error('[Translation] IPC Error, falling back to Web:', e);
    }
  }

  // 🌐 WEB FETCH (Para GitHub Pages y Navegadores)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: clean,
        source_lang: from,
        target_lang: to === 'en' ? 'EN-US' : to,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || 'Server Error');
    }
    
    const data = await res.json();
    return data.translated_text || clean;
  } catch (e) {
    console.error('[Translation] Backend Error:', e);
    return clean; // Retorna el texto original si falla
  }
}

// ── useTranslation ────────────────────────────────────────────────
export function useTranslation({ from = 'en', to = 'es' } = {}) {
  const cacheRef = useRef(new Map())

  const translate = useCallback(async (text) => {
    const clean = text?.trim()
    if (!clean) return ''

    // Generamos una llave de caché para no traducir lo mismo dos veces
    const cacheKey = `${from}|${to}:${clean}`
    if (cacheRef.current.has(cacheKey)) {
      return cacheRef.current.get(cacheKey)
    }

    // Llamamos al backend sin pasar ninguna API Key (ya la tiene el server)
    const result = await callTranslate({ text: clean, from, to })
    
    if (result && result !== clean) {
      cacheRef.current.set(cacheKey, result)
    }
    return result
  }, [from, to])

  return { translate }
}

// ── useAutoTranslation ─────────────────────────────────────────────
export function useAutoTranslation(sourceText, {
  from       = 'en',
  to         = 'es',
  debounceMs = 600,
} = {}) {
  const { translate } = useTranslation({ from, to })
  const [result, setResult] = useState('')
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