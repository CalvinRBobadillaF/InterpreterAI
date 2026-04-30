/**
 * hooks/useTranslation.js
 *
 * ARQUITECTURA NUEVA vs anterior:
 * ─────────────────────────────────────────────────────
 * Antes: hook con debounce sobre texto acumulado → traducía TODO de nuevo
 * Ahora: `translateText()` exportada → App.jsx la llama por utterance
 *
 * VENTAJA DE VELOCIDAD:
 * - Traducción inicia INMEDIATAMENTE al recibir is_final (sin debounce)
 * - Solo traduce el utterance nuevo, no el texto completo acumulado
 * - Caché global: frase repetida = respuesta instantánea (0ms, 0 tokens)
 * - Deduplicación: misma frase pedida dos veces → una sola petición HTTP
 *
 * KEEP-ALIVE:
 * - Ping a Render cada 5 min para evitar cold start de 15-30s
 */

const BACKEND_URL = 'https://interpreterbk.onrender.com/api/translate'
const PING_URL    = 'https://interpreterbk.onrender.com'

// ── Keep-alive ────────────────────────────────────────────────────────────
;(function keepAlive() {
  fetch(PING_URL).catch(() => {})
  setInterval(() => fetch(PING_URL).catch(() => {}), 5 * 60 * 1000)
})()

// ── Caché global ──────────────────────────────────────────────────────────
const globalCache     = new Map()
const pendingRequests = new Map()

// ── translateText — exportada para uso directo en App.jsx ─────────────────
export async function translateText({ text, from, to, signal = null }) {
  const clean = text?.trim()
  if (!clean) return ''

  const fromNorm = from.startsWith('en') ? 'en' : 'es'
  const toNorm   = to.startsWith('en')   ? 'en' : 'es'

  const targetDeepL = toNorm === 'en' ? 'EN-US' : 'ES'
  const sourceDeepL = fromNorm.toUpperCase()

  const cacheKey = `${fromNorm}|${toNorm}:${clean}`

  if (globalCache.has(cacheKey))     return globalCache.get(cacheKey)
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey)

  const fetchOptions = {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text:        clean,
      source_lang: sourceDeepL,
      target_lang: targetDeepL,
    }),
  }
  if (signal) fetchOptions.signal = signal

  const promise = fetch(BACKEND_URL, fetchOptions)
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data      = await res.json()
      const resultado = data.translated_text || clean
      globalCache.set(cacheKey, resultado)
      return resultado
    })
    .catch((e) => {
      if (e.name === 'AbortError') return null
      console.error('[Traducción]', e.message)
      return clean
    })
    .finally(() => {
      pendingRequests.delete(cacheKey)
    })

  pendingRequests.set(cacheKey, promise)
  return promise
}
