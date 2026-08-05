/**
 * hooks/useTranslation.js
 *
 * ENRUTADOR HÍBRIDO — completa y corrige tu borrador:
 * ─────────────────────────────────────────────────────────────────────
 * - Cualquier traducción HACIA o DESDE 'ht' (Criollo Haitiano) → llama
 *   a Google Cloud Translation DIRECTO desde el navegador (DeepL no
 *   soporta ht — verificado en su documentación oficial, no está en su
 *   lista de ~36 idiomas). Necesitas una API key de Google Cloud
 *   Translation guardada en localStorage bajo la key 'google_key'.
 *
 * - Cualquier otro par (hoy: en↔es) → sigue yendo a tu backend de
 *   Render sin ningún cambio, exactamente como ya funciona.
 *
 * FIXES respecto a tu versión:
 * 1. `prewarmTranslation` estaba vacío (no hacía nada) — ahora sí
 *    dispara la traducción anticipada real, igual que translateText
 *    pero sin bloquear ni reintentar tan agresivo.
 * 2. BUG DE DEEPL: mandabas target_lang='EN' o 'PT' directo — DeepL
 *    RECHAZA esos códigos como destino (exige 'EN-US'/'EN-GB' y
 *    'PT-BR'/'PT-PT' específicamente). Solo importa si algún día vuelves
 *    a traducir HACIA inglés o portugués — con el flujo actual (en/es →
 *    ht) esta rama de DeepL no se usa, pero la dejo corregida por si acaso.
 * 3. Mismo timeout + reintentos con backoff para AMBOS proveedores
 *    (antes solo DeepL los tenía).
 * 4. Si falta la Google API key, falla con un mensaje claro en vez de
 *    mandarle a Google un placeholder inválido.
 */

const BACKEND_URL    = 'https://interpreterbk.onrender.com/api/translate'
const PING_URL       = 'https://interpreterbk.onrender.com'
const GOOGLE_URL     = 'https://translation.googleapis.com/language/translate/v2'
const MAX_RETRIES    = 2
const RETRY_DELAY    = 150
const REQ_TIMEOUT    = 3_500
const MAX_CACHE_SIZE = 500

// ── Keep-alive de tu backend Render ────────────────────────────────────
;(function keepAlive() {
  fetch(PING_URL).catch(() => {})
  setInterval(() => fetch(PING_URL).catch(() => {}), 3 * 60 * 1_000)
})()

// ── LRU Cache (compartida entre ambos proveedores) ─────────────────────
const lruCache = {
  _map: new Map(),
  has(key) { return this._map.has(key) },
  get(key) {
    if (!this._map.has(key)) return undefined
    const val = this._map.get(key)
    this._map.delete(key)
    this._map.set(key, val)
    return val
  },
  set(key, val) {
    if (this._map.has(key)) this._map.delete(key)
    this._map.set(key, val)
    if (this._map.size > MAX_CACHE_SIZE) {
      this._map.delete(this._map.keys().next().value)
    }
  },
  get size() { return this._map.size },
}

const pendingRequests = new Map()

// ── Utilidades ──────────────────────────────────────────────────────────
function anySignal(signals) {
  const ctrl = new AbortController()
  for (const sig of signals) {
    if (!sig) continue
    if (sig.aborted) { ctrl.abort(sig.reason); break }
    sig.addEventListener('abort', () => ctrl.abort(sig.reason), { once: true })
  }
  return ctrl.signal
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
    }, { once: true })
  })

function isValidTranslation(result, original) {
  if (!result || result.trim().length === 0) return false
  if (result.trim() === original.trim())     return false
  return true
}

function normalizeForCache(text) {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?…\u2026]+$/, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .toLowerCase()
}

// FIX #2: DeepL exige códigos regionales como TARGET para en/pt.
// Como fuente, el código genérico sí funciona.
function toDeepLSource(code) {
  return code.toUpperCase()  // 'EN', 'ES', 'FR', 'PT' — válido como origen
}
function toDeepLTarget(code) {
  const c = code.toLowerCase()
  if (c === 'en') return 'EN-US'
  if (c === 'pt') return 'PT-BR'
  return code.toUpperCase()  // ES, FR no necesitan variante regional
}

// ── Google Cloud Translation (para cualquier par con 'ht') ─────────────
async function translateWithGoogle({ text, from, to, signal }) {
  const apiKey = localStorage.getItem('google_key')?.trim()
  if (!apiKey) {
    throw new Error("Missing Google Translate API key — set localStorage 'google_key'")
  }

  const timeoutCtrl = new AbortController()
  const timeoutId   = setTimeout(() => timeoutCtrl.abort(), REQ_TIMEOUT)
  const combinedSignal = anySignal([signal, timeoutCtrl.signal])

  try {
    const res = await fetch(`${GOOGLE_URL}?key=${encodeURIComponent(apiKey)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  combinedSignal,
      body: JSON.stringify({
        q:      text,
        source: from,   // Google usa minúsculas de 2 letras: 'en', 'es', 'ht'
        target: to,
        format: 'text',
      }),
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => null)
      throw new Error(`Google Translate: ${errBody?.error?.message || `HTTP ${res.status}`}`)
    }

    const data = await res.json()
    return data?.data?.translations?.[0]?.translatedText || null

  } finally {
    clearTimeout(timeoutId)
  }
}

// ── DeepL vía tu backend de Render (para pares sin 'ht') ────────────────
async function translateWithDeepL({ text, from, to, context, signal }) {
  const timeoutCtrl = new AbortController()
  const timeoutId   = setTimeout(() => timeoutCtrl.abort(), REQ_TIMEOUT)
  const combinedSignal = anySignal([signal, timeoutCtrl.signal])

  try {
    const body = {
      text,
      source_lang: toDeepLSource(from),
      target_lang: toDeepLTarget(to),
    }
    if (context) body.context = context

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

// ── Despachador: decide Google vs DeepL según el par ─────────────────────
async function dispatchTranslate({ clean, fromNorm, toNorm, context, signal }) {
  if (fromNorm === 'ht' || toNorm === 'ht') {
    return translateWithGoogle({ text: clean, from: fromNorm, to: toNorm, signal })
  }
  return translateWithDeepL({ text: clean, from: fromNorm, to: toNorm, context, signal })
}

// ── translateText — misma firma de siempre ───────────────────────────────
export async function translateText({ text, from, to, context = null, signal = null }) {
  const clean = text?.trim()
  if (!clean) return ''

  const fromNorm = from.slice(0, 2).toLowerCase()
  const toNorm   = to.slice(0, 2).toLowerCase()
  if (fromNorm === toNorm) return null

  const cacheKey = `${fromNorm}|${toNorm}:${normalizeForCache(clean)}`

  if (lruCache.has(cacheKey))        return lruCache.get(cacheKey)
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey)

  const promise = (async () => {
    let lastError
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) return null

      try {
        const resultado = await dispatchTranslate({ clean, fromNorm, toNorm, context, signal })

        if (isValidTranslation(resultado, clean)) {
          lruCache.set(cacheKey, resultado)
          return resultado
        }
        lastError = new Error('Respuesta vacía o igual al original')

      } catch (e) {
        if (e.name === 'AbortError') return null
        lastError = e
        console.warn(`[Traducción] Intento ${attempt + 1} fallido: ${e.message}`)
      }

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * 2 ** attempt
        try { await sleep(delay, signal) } catch (e) { if (e.name === 'AbortError') return null }
      }
    }

    console.error('[Traducción] Todos los reintentos fallaron:', lastError?.message)
    return null

  })().finally(() => {
    pendingRequests.delete(cacheKey)
  })

  pendingRequests.set(cacheKey, promise)
  return promise
}

// ── prewarmTranslation — FIX: antes no hacía nada, ahora sí funciona ────
export function prewarmTranslation({ text, from, to }) {
  const clean = text?.trim()
  if (!clean || clean.length < 10 || !to) return

  const fromNorm = from.slice(0, 2).toLowerCase()
  const toNorm   = to.slice(0, 2).toLowerCase()
  if (fromNorm === toNorm) return

  const cacheKey = `${fromNorm}|${toNorm}:${normalizeForCache(clean)}`
  if (lruCache.has(cacheKey) || pendingRequests.has(cacheKey)) return

  const promise = (async () => {
    try {
      const resultado = await dispatchTranslate({ clean, fromNorm, toNorm, context: null, signal: null })
      if (isValidTranslation(resultado, clean)) {
        lruCache.set(cacheKey, resultado)
        console.debug('[Prewarm] ✓ cached:', clean.slice(0, 40))
      }
    } catch (e) {
      console.debug('[Prewarm] falló (no es grave, se reintentará al finalizar):', e.message)
    }
  })().finally(() => {
    pendingRequests.delete(cacheKey)
  })

  pendingRequests.set(cacheKey, promise)
}

// ── Debug helper ──────────────────────────────────────────────────────────
export function getCacheStats() {
  return { size: lruCache.size, limit: MAX_CACHE_SIZE, pending: pendingRequests.size }
}
