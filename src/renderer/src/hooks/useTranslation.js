/**
 * hooks/useTranslation.js
 *
 * FIXES en esta versión:
 * ─────────────────────────────────────────────────────────────────────
 * 1. RETRY LOGIC: si la petición falla (red, 5xx), reintenta hasta 2 veces
 *    con backoff de 300ms. Esto arregla el bug de "traducción no carga".
 *
 * 2. TIMEOUT: cada petición tiene 8s de timeout. Si Render está en cold
 *    start (primer ping del día), no bloquea indefinidamente.
 *
 * 3. CACHÉ mejorada: las traducciones fallidas NO se cachean.
 *    Antes, un fallo devolvía el texto original y lo cacheaba → nunca
 *    se reintentaba esa frase.
 *
 * 4. KEEP-ALIVE: ping a Render cada 4 min (antes 5) para reducir
 *    probabilidad de cold start en sesiones largas.
 */

const BACKEND_URL  = 'https://interpreterbk.onrender.com/api/translate'
const PING_URL     = 'https://interpreterbk.onrender.com'
const MAX_RETRIES  = 2
const RETRY_DELAY  = 350   // ms entre reintentos
const REQ_TIMEOUT  = 8000  // ms antes de abortar la petición

// ── Keep-alive ────────────────────────────────────────────────────────────
;(function keepAlive() {
  fetch(PING_URL).catch(() => {})
  setInterval(() => fetch(PING_URL).catch(() => {}), 4 * 60 * 1000)
})()

// ── Caché: solo guarda traducciones exitosas ───────────────────────────────
const globalCache     = new Map()
const pendingRequests = new Map()

// ── Helper: sleep ─────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── Una sola petición con timeout ─────────────────────────────────────────
async function fetchTranslation({ clean, sourceDeepL, targetDeepL, signal }) {
  // Timeout independiente del signal externo
  const timeoutCtrl = new AbortController()
  const timeoutId   = setTimeout(() => timeoutCtrl.abort(), REQ_TIMEOUT)

  // Combinar signal externo + timeout usando AbortSignal.any si disponible,
  // de lo contrario solo usamos el timeout
  let combinedSignal = timeoutCtrl.signal
  if (signal && typeof AbortSignal.any === 'function') {
    combinedSignal = AbortSignal.any([signal, timeoutCtrl.signal])
  }

  try {
    const res = await fetch(BACKEND_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  combinedSignal,
      body: JSON.stringify({
        text:        clean,
        source_lang: sourceDeepL,
        target_lang: targetDeepL,
      }),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    return data.translated_text || null

  } finally {
    clearTimeout(timeoutId)
  }
}

// ── translateText — exportada para uso directo ────────────────────────────
export async function translateText({ text, from, to, signal = null }) {
  const clean = text?.trim()
  if (!clean) return ''

  const fromNorm    = from.startsWith('en') ? 'en' : 'es'
  const toNorm      = to.startsWith('en')   ? 'en' : 'es'
  const targetDeepL = toNorm   === 'en' ? 'EN-US' : 'ES'
  const sourceDeepL = fromNorm === 'en' ? 'EN'    : 'ES'

  const cacheKey = `${fromNorm}|${toNorm}:${clean}`

  // 1. Caché instantánea
  if (globalCache.has(cacheKey)) return globalCache.get(cacheKey)

  // 2. Deduplicación — reusar Promise en vuelo para la misma frase
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey)

  // 3. Petición con retry
  const promise = (async () => {
    let lastError
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Si el signal externo ya fue abortado, salir inmediatamente
      if (signal?.aborted) return null

      try {
        const resultado = await fetchTranslation({
          clean, sourceDeepL, targetDeepL, signal,
        })

        if (resultado) {
          // FIX #3: solo cachear si fue exitosa
          globalCache.set(cacheKey, resultado)
          return resultado
        }

        // Respuesta vacía — reintentar
        lastError = new Error('Empty translation response')

      } catch (e) {
        if (e.name === 'AbortError') return null  // Signal externo → no reintentar
        lastError = e
        console.warn(`[Traducción] Attempt ${attempt + 1} failed: ${e.message}`)
      }

      // Esperar antes del siguiente intento (excepto en el último)
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY * (attempt + 1))
    }

    // Todos los intentos fallaron — devolver texto original como fallback
    console.error('[Traducción] All retries failed:', lastError?.message)
    return clean

  })().finally(() => {
    pendingRequests.delete(cacheKey)
  })

  pendingRequests.set(cacheKey, promise)
  return promise
}
