/**
 * main.js  —  Electron Main Process
 *
 * BUG CORREGIDO:
 *   El handler estaba registrado como 'translate' pero preload.js
 *   llamaba ipcRenderer.invoke('deepl-translate') → nunca coincidían.
 *   Ahora ambos usan el mismo nombre: 'deepl-translate'.
 *
 * TAMBIÉN SE AGREGÓ:
 *   El handler 'get-audio-source' que faltaba en esta versión del archivo
 *   pero sí estaba en preload.js.
 */

const { app, BrowserWindow, ipcMain, net, desktopCapturer, session } = require('electron')
const path = require('path')

// ── IPC: Traducción DeepL ───────────────────────────────────────────
// Corre en el proceso principal → sin restricciones CORS.
// NOMBRE CORREGIDO: 'deepl-translate' (coincide con preload.js)
ipcMain.handle('deepl-translate', async (_event, { text, from, to }) => {
  if (!text?.trim()) return text

  // Leemos la API key del ambiente (más seguro que recibirla del renderer)
  const apiKey = process.env.DEEPL_API_KEY || ''
  if (!apiKey) {
    console.warn('[Main] DEEPL_API_KEY no configurada en el entorno')
    return text
  }

  const body = new URLSearchParams({
    auth_key:    apiKey,
    text:        text.trim(),
    source_lang: from.toUpperCase(),
    target_lang: to.toUpperCase() === 'EN' ? 'EN-US' : to.toUpperCase(),
    // Registro formal — apropiado para intérpretes
    formality:   'prefer_more',
  }).toString()

  return new Promise((resolve) => {
    const req = net.request({ method: 'POST', url: 'https://api-free.deepl.com/v2/translate' })
    req.setHeader('Content-Type', 'application/x-www-form-urlencoded')

    let respuesta = ''
    req.on('response', (res) => {
      res.on('data',  (chunk) => { respuesta += chunk })
      res.on('end',   () => {
        try {
          const parsed = JSON.parse(respuesta)
          resolve(parsed.translations?.[0]?.text || text)
        } catch (e) {
          console.error('[Main] Error parseando respuesta DeepL:', e.message)
          resolve(text) // fallback al texto original
        }
      })
    })

    req.on('error', (e) => {
      console.error('[Main] Error de red DeepL:', e.message)
      resolve(text)
    })

    req.write(body)
    req.end()
  })
})

// ── IPC: Audio del sistema (desktopCapturer) ────────────────────────
// desktopCapturer solo funciona en el proceso principal desde Electron 13+
ipcMain.handle('get-audio-source', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 }, // sin thumbnails → más rápido
  })
  return sources.find(s => s.id.startsWith('screen')) || sources[0] || null
})

// ── Ventana principal ────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 680, minWidth: 800, minHeight: 500,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  // Permisos necesarios para micrófono y captura de pantalla
  win.webContents.session.setPermissionCheckHandler((_wc, permission) =>
    ['media', 'microphone', 'display-capture'].includes(permission)
  )
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(['media', 'microphone', 'display-capture'].includes(permission))
  )

  // Desarrollo: Vite dev server
  win.loadURL('http://localhost:5173')
  // Producción: win.loadFile(path.join(__dirname, 'dist/index.html'))

  win.webContents.openDevTools()
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
