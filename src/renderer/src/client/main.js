/**
 * main.js — Electron Main Process
 */

const { app, BrowserWindow, session, ipcMain, desktopCapturer, net } = require('electron')
const path = require('path')

// ── IPC: Desktop Capturer ───────────────────────────────────────────────────

ipcMain.handle('get-audio-source', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 },
  })
  return sources.find(s => s.id.startsWith('screen')) || sources[0] || null
})

ipcMain.handle('get-all-sources', async () => {
  return desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 150, height: 100 },
  })
})

// ── IPC: DeepL Translation ──────────────────────────────────────────────────
ipcMain.handle('deepl-translate', async (_event, { text, from, to, apiKey }) => {
  if (!text?.trim() || !apiKey) return text

  const targetLang = to.toUpperCase() === 'EN' ? 'EN-US' : to.toUpperCase()
  const sourceLang = from.toUpperCase()

  const body = new URLSearchParams({
    auth_key:    apiKey,
    text:        text.trim(),
    source_lang: sourceLang,
    target_lang: targetLang,
  })

  return new Promise((resolve) => {
    const request = net.request({
      method: 'POST',
      url:    'https://api-free.deepl.com/v2/translate',
    })

    request.setHeader('Content-Type', 'application/x-www-form-urlencoded')

    let responseBody = ''
    request.on('response', (response) => {
      response.on('data', (chunk) => { responseBody += chunk })
      response.on('end', () => {
        try {
          const data = JSON.parse(responseBody)
          const result = data?.translations?.[0]?.text
          resolve(result || text)
        } catch (e) {
          console.error('[DeepL IPC] Parse error:', e.message, responseBody)
          resolve(text)
        }
      })
    })

    request.on('error', (e) => {
      console.error('[DeepL IPC] Request error:', e.message)
      resolve(text)
    })

    request.write(body.toString())
    request.end()
  })
})

// ── Window & Security ────────────────────────────────────────────────────────

function createWindow() {
  // Configuración de la sesión ANTES de crear la ventana
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "connect-src 'self' wss://api.deepgram.com https://api.deepgram.com https://api-free.deepl.com https://api.deepl.com; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com; " +
          "img-src 'self' data: blob:; " +
          "media-src 'self' blob:;"
        ]
      }
    })
  })

  const win = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 800,
    minHeight: 500,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Si el error persiste, descomenta la siguiente línea para debuguear:
      // webSecurity: false 
    },
  })

  // Manejo de permisos (Micrófono, etc.)
  win.webContents.session.setPermissionCheckHandler((_wc, permission) =>
    ['media', 'microphone', 'camera', 'display-capture'].includes(permission)
  )
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(['media', 'microphone', 'camera', 'display-capture'].includes(permission))
  )

  win.loadURL('http://localhost:5173')
  
  // Abrir herramientas de desarrollo automáticamente para ver si el error cambia
  win.webContents.openDevTools()
}