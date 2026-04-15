/**
 * hooks/useTranslation.js
 * ─────────────────────────────────────────────────────────────────
 * ARQUITECTURA DEFINITIVA:
 * - KEEP-ALIVE: Ping cada 5 min para evitar que Render hiberne.
 * - FIABILIDAD (0 Saltos): Re-evalúa todo el texto en cada cambio.
 * - VELOCIDAD EXTREMA: Usa una memoria caché agresiva. Los párrafos 
 * viejos o ya terminados cargan al instante; solo la oración que 
 * se está hablando en este momento hace peticiones al backend.
 * - ABORT CONTROLLER: Cancela automáticamente las peticiones en red
 * si el usuario sigue hablando, evitando lag y respuestas cruzadas.
 * ─────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const IS_ELECTRON = !!window.electronAPI?.isElectron
const BACKEND_URL = 'https://interpreterbk.onrender.com/api/translate'

// ── 1. Precalentamiento y Keep-Alive (Render.com) ──────────────────
;(function mantenerDespierto() {
  // Ping inicial a la ruta de salud de FastAPI ("/")
  const pingUrl = BACKEND_URL.replace('/api/translate', '')
  
  fetch(pingUrl, { method: 'GET' }).catch(() => {})
  
  // Ping cada 5 minutos
  setInterval(() => {
    fetch(pingUrl, { method: 'GET' }).catch(() => {})
  }, 5 * 60 * 1000)
})()

// ── 2. Caché Global ────────────────────────────────────────────────
// Al sacarlo del hook, la caché sobrevive incluso si el componente se desmonta
const globalCache = new Map()

// ── 3. Core HTTP ───────────────────────────────────────────────────
async function callTranslate({ text, from, to, signal }) {
  const clean = text?.trim()
  if (!clean) return ''

  // A. Intentar por IPC (Electron)
  if (IS_ELECTRON && window.electronAPI?.translate) {
    try {
      const result = await window.electronAPI.translate({ text: clean, from, to })
      if (result) return result
    } catch (e) {
      console.warn('[Traducción] IPC falló, usando web:', e.message)
    }
  }

  // B. Backend en Render
  try {
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal, // Permite cancelar la petición si queda obsoleta
      body: JSON.stringify({
        text: clean,
        source_lang: from,
        target_lang: to === 'en' ? 'EN-US' : to.toUpperCase(),
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `HTTP ${res.status}`)
    }

    const data = await res.json()
    return data.translated_text || clean

  } catch (e) {
    if (e.name === 'AbortError') return null // Petición cancelada
    console.error('[Traducción] Error:', e.message)
    return clean // Fallback al texto original
  }
}

// ── 4. Hook Manual (Para traducciones de botones o inputs) ─────────
export function useTranslation({ from = 'en', to = 'es' } = {}) {
  const translate = useCallback(async (text) => {
    const clean = text?.trim()
    if (!clean) return ''

    const cacheKey = `${from}|${to}:${clean}`
    if (globalCache.has(cacheKey)) return globalCache.get(cacheKey)

    const result = await callTranslate({ text: clean, from, to })
    
    if (result && result !== clean) {
      globalCache.set(cacheKey, result)
    }
    return result || clean
  }, [from, to])

  return { translate }
}

// ── 5. Hook Automático (Para la transcripción en vivo) ─────────────
export function useAutoTranslation(sourceText, {
  from = 'en',
  to = 'es',
  debounceMs = 300, // Debounce rápido para que se sienta fluido
} = {}) {
  const [result, setResult] = useState('')
  const [translating, setTranslating] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!sourceText?.trim()) {
      setResult('')
      return
    }

    // El AbortController se crea aquí para matar peticiones de la red 
    // si el useEffect vuelve a dispararse (ej. el usuario sigue hablando).
    const controller = new AbortController()

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setTranslating(true)

      // 1. Dividimos todo el texto en párrafos
      const paragraphs = sourceText
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(Boolean)

      // 2. Procesamos todos los párrafos
      const translationPromises = paragraphs.map(async (p) => {
        const cacheKey = `${from}|${to}:${p}`
        
        // ¡LA MAGIA! Si el párrafo ya está en caché, se resuelve instantáneamente.
        // Esto evita saltos de texto sin penalizar el rendimiento.
        if (globalCache.has(cacheKey)) {
          return globalCache.get(cacheKey)
        }

        // Solo los párrafos nuevos o modificados hacen petición HTTP
        const translatedResult = await callTranslate({
          text: p,
          from,
          to,
          signal: controller.signal
        })

        // Si la petición no fue cancelada, la guardamos
        if (translatedResult) {
          globalCache.set(cacheKey, translatedResult)
          return translatedResult
        }
        return ''
      })

      const results = await Promise.all(translationPromises)
      
      // Filtramos valores nulos (cancelaciones) y unimos con doble salto de línea
      const finalTranslatedText = results.filter(Boolean).join('\n\n')
      
      if (finalTranslatedText) {
        setResult(finalTranslatedText)
      }
      setTranslating(false)
    }, debounceMs)

    // Cleanup: cancela el timeout y aborta peticiones HTTP en vuelo
    return () => {
      clearTimeout(timerRef.current)
      controller.abort()
    }
  }, [sourceText, from, to, debounceMs])

  return { translatedText: result, translating }
}