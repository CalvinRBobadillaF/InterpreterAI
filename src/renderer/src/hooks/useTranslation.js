/**
 * hooks/useTranslation.js  v3
 *
 * FIXES en esta versión:
 * ─────────────────────────────────────────────────────────────────────
 * 1. SAME-TEXT DETECTION: si el backend devuelve exactamente el mismo
 *    texto que se mandó (traducción fallida silenciosa), no se cachea
 *    y se reintenta. Antes esto se cacheaba como "exitoso" y el card
 *    mostraba el original como si fuera la traducción.
 *
 * 2. CONTEXT SUPPORT: translateText acepta `context` opcional que se
 *    manda al backend → DeepL lo usa para mejorar precisión de dominio
 *    (medicina, legal, etc.). Requiere soporte en tu backend.
 *
 * 3. PREWARM MÁS INTELIGENTE: normaliza el texto antes del cacheKey
 *    (trim + colapsar espacios + strip de puntuación trailing + lowercase).
 *    El interim "hola mundo," y el final "Hola mundo." ahora comparten
 *    el mismo cache key → más hits, menos requests.
 *
 * 4. translateText devuelve null en fallo total en lugar del original.
 *    App.jsx decide qué mostrar (ícono de retry en lugar de texto idéntico).
 *
 * 5. Mantenidos: retry con backoff, caché solo exitosa, dedup, keep-alive.
 */

const BACKEND_URL  = 'https://interpreterbk.onrender.com/api/translate'
const PING_URL     = 'https://interpreterbk.onrender.com'
const MAX_RETRIES  = 2
const RETRY_DELAY  = 300
const REQ_TIMEOUT  = 6000

// ── Keep-alive ────────────────────────────────────────────────────────────
;(function keepAlive() {
  fetch(PING_URL).catch(() => {})
  setTimeout(() => fetch(PING_URL).catch(() => {}), 5_000)
  setInterval(() => fetch(PING_URL).catch(() => {}), 3 * 60 * 1000)
})()

const globalCache     = new Map()
const pendingRequests = new Map()
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── Validar que la traducción es genuinamente diferente al original ────────
function isValidTranslation(result, original) {
  if (!result || result.trim().length === 0) return false
  if (result.trim() === original.trim())     return false  // same-text → inválido
  return true
}

// ── Normalizar para cache key: más hits entre interim y final ─────────────
// El texto real enviado al backend NO se modifica.
function normalizeForCache(text) {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?…]+$/, '')
    .toLowerCase()
}

async function fetchTranslation({ clean, sourceDeepL, targetDeepL, context, signal }) {
  const timeoutCtrl = new AbortController()
  const timeoutId   = setTimeout(() => timeoutCtrl.abort(), REQ_TIMEOUT)

  let combinedSignal = timeoutCtrl.signal
  if (signal && typeof AbortSignal.any === 'function') {
    combinedSignal = AbortSignal.any([signal, timeoutCtrl.signal])
  }

  try {
    const body = { text: clean, source_lang: sourceDeepL, target_lang: targetDeepL }
    if (context) body.context = context   // FIX #2: contexto de dominio

    const res = await fetch(BACKEND_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  combinedSignal,
      body:    JSON.stringify(body),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.translated_text || null

  } finally {
    clearTimeout(timeoutId)
  }
}

// ── translateText ─────────────────────────────────────────────────────────
export async function translateText({ text, from, to, context = null, signal = null }) {
  const clean = text?.trim()
  if (!clean) return ''

  const fromNorm = from.startsWith('en') ? 'en' : 'es'
  const toNorm   = to.startsWith('en')   ? 'en' : 'es'

  // Si los idiomas son iguales no tiene sentido traducir
  if (fromNorm === toNorm) return null

  const targetDeepL = toNorm   === 'en' ? 'EN-US' : 'ES'
  const sourceDeepL = fromNorm === 'en' ? 'EN'    : 'ES'
  const cacheKey    = `${fromNorm}|${toNorm}:${normalizeForCache(clean)}`

  if (globalCache.has(cacheKey))     return globalCache.get(cacheKey)
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey)

  const promise = (async () => {
    let lastError
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) return null

      try {
        const resultado = await fetchTranslation({ clean, sourceDeepL, targetDeepL, context, signal })

        if (isValidTranslation(resultado, clean)) {
          globalCache.set(cacheKey, resultado)
          return resultado
        }

        // Respuesta igual al original → reintentar (no cachear)
        lastError = new Error('Same-text or empty translation response')
        console.warn(`[Traducción] Invalid response on attempt ${attempt + 1}`)

      } catch (e) {
        if (e.name === 'AbortError') return null
        lastError = e
        console.warn(`[Traducción] Attempt ${attempt + 1} failed: ${e.message}`)
      }

      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY * (attempt + 1))
    }

    console.error('[Traducción] All retries failed:', lastError?.message)
    return null  // FIX #4: null en vez de original — App.jsx muestra retry UI

  })().finally(() => {
    pendingRequests.delete(cacheKey)
  })

  pendingRequests.set(cacheKey, promise)
  return promise
}

// ── prewarmTranslation ────────────────────────────────────────────────────
export function prewarmTranslation({ text, from }) {
  const clean = text?.trim()
  if (!clean || clean.length < 10) return

  const fromNorm = from.startsWith('en') ? 'en' : 'es'
  const toNorm   = fromNorm === 'en' ? 'es' : 'en'
  if (fromNorm === toNorm) return

  const targetDeepL = toNorm   === 'en' ? 'EN-US' : 'ES'
  const sourceDeepL = fromNorm === 'en' ? 'EN'    : 'ES'
  const cacheKey    = `${fromNorm}|${toNorm}:${normalizeForCache(clean)}`

  if (globalCache.has(cacheKey) || pendingRequests.has(cacheKey)) return

  const promise = (async () => {
    try {
      const resultado = await fetchTranslation({ clean, sourceDeepL, targetDeepL, context: null, signal: null })
      if (isValidTranslation(resultado, clean)) {
        globalCache.set(cacheKey, resultado)
        console.debug('[Prewarm] ✓ cached:', clean.slice(0, 40))
      }
    } catch { /* silencioso — best-effort */ }
  })().finally(() => {
    pendingRequests.delete(cacheKey)
  })

  pendingRequests.set(cacheKey, promise)
}
