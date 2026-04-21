/**
 * hooks/useTranslation.js
 *
 * ── CAMBIO PRINCIPAL ───────────────────────────────────────────────
 * Ahora usa DeepL directamente a través del backend de Render.
 * El backend ya tiene la API key premium configurada como variable de
 * entorno — el frontend NO necesita enviar ninguna key.
 *
 * Para activar la clave premium en el backend:
 *   1. Ve a tu dashboard de Render.com → tu servicio → Environment
 *   2. Cambia la variable:  DEEPL_API_KEY=tu_clave_premium_aqui
 *   3. Render redespliega automáticamente
 *   El frontend no cambia nada — sigue llamando al mismo endpoint.
 *
 * ── GARANTÍA DE NO-GASTO EN MODO SUBTÍTULOS ────────────────────────
 * App.jsx pasa sourceText='' cuando subtitleOnly===true.
 * Este hook hace un early-return inmediato si el texto está vacío,
 * por lo que nunca llega a hacer fetch() al backend.
 * Cero tokens gastados en modo solo subtítulos.
 *
 * ── ARQUITECTURA ──────────────────────────────────────────────────
 * - Keep-alive: ping GET a "/" de Render cada 5 min (evita cold start)
 * - Caché global: misma frase = respuesta instantánea, 0 peticiones
 * - Promise deduplication: si la misma frase se pide dos veces al mismo
 *   tiempo (EN panel + ES panel), solo se hace UNA llamada HTTP
 * - AbortController: cancela peticiones obsoletas al llegar texto nuevo
 */

import { useEffect, useRef, useState } from 'react'

const BACKEND_URL = 'https://interpreterbk.onrender.com/api/translate'
const PING_URL    = 'https://interpreterbk.onrender.com'

// ── Keep-alive: mantiene Render despierto ──────────────────────────
;(function keepAlive() {
  // Ping inmediato al cargar la app
  fetch(PING_URL).catch(() => {})
  // Ping cada 5 minutos durante la sesión
  setInterval(() => fetch(PING_URL).catch(() => {}), 5 * 60 * 1000)
})()

// ── Caché global ───────────────────────────────────────────────────
// Fuera del hook → sobrevive re-renders y desmontajes de componentes.
const globalCache = new Map()

// ── Promise deduplication ──────────────────────────────────────────
// Si dos componentes piden la misma traducción al mismo tiempo,
// reutilizamos la misma Promise en vez de hacer dos fetch().
const pendingRequests = new Map()

// ── Función base de traducción ─────────────────────────────────────
async function callTranslate({ text, from, to, signal }) {
  const clean = text?.trim()
  if (!clean) return ''

  const cacheKey = `${from}|${to}:${clean}`

  // 1. Caché: respuesta instantánea
  if (globalCache.has(cacheKey)) return globalCache.get(cacheKey)

  // 2. Deduplicación: reusar petición en vuelo si existe
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)
  }

  // 3. Nueva petición al backend
  // El backend tiene la API key — el frontend no envía ninguna credencial
  const promise = fetch(BACKEND_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      text,
      source_lang: from,
      // DeepL necesita EN-US, no EN genérico
      target_lang: to === 'en' ? 'EN-US' : to.toUpperCase(),
    }),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const resultado = data.translated_text || clean
      globalCache.set(cacheKey, resultado)
      return resultado
    })
    .catch((e) => {
      if (e.name === 'AbortError') return null
      console.error('[Traducción]', e.message)
      return clean // fallback al texto original
    })
    .finally(() => {
      pendingRequests.delete(cacheKey)
    })

  pendingRequests.set(cacheKey, promise)
  return promise
}


// ── Hook: useAutoTranslation ───────────────────────────────────────
// Observa sourceText y traduce automáticamente solo los párrafos NUEVOS.
//
// GARANTÍA DE CERO GASTO EN MODO SUBTÍTULOS:
//   App.jsx pasa '' como sourceText cuando subtitleOnly===true.
//   El primer if (!sourceText?.trim()) hace return inmediato → nunca fetch().
export function useAutoTranslation(sourceText, {
  from       = 'en',
  to         = 'es',
  debounceMs = 300,
} = {}) {
  const [result,      setResult]      = useState('')
  const [translating, setTranslating] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    // ── EARLY RETURN: texto vacío = modo subtítulos activo ─────
    // Este bloque nunca llega a hacer fetch(), garantizando 0 tokens gastados
    if (!sourceText?.trim()) {
      setResult('')
      return
    }

    // AbortController: cancela peticiones si el texto cambia antes de responder
    const controller = new AbortController()

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setTranslating(true)

      // Dividimos en párrafos (cada \n\n es una burbuja separada)
      const parrafos = sourceText
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(Boolean)

      // Traducimos todos los párrafos en paralelo
      // Los que ya están en caché se resuelven instantáneamente
      const resultados = await Promise.all(
        parrafos.map(p => callTranslate({ text: p, from, to, signal: controller.signal }))
      )

      const textoFinal = resultados.filter(Boolean).join('\n\n')
      if (textoFinal) setResult(textoFinal)

      setTranslating(false)
    }, debounceMs)

    return () => {
      clearTimeout(timerRef.current)
      controller.abort() // cancela fetch si el componente se desmonta o cambia texto
    }
  }, [sourceText, from, to, debounceMs])

  return { translatedText: result, translating }
}
