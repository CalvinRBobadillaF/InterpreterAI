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
const { 
  app, BrowserWindow, ipcMain, 
  net, desktopCapturer 
} = require('electron')
const path = require('path')

// ── Registro de handlers IPC ───────────────────────────────────────
function registerIpcHandlers() {

  ipcMain.handle('deepl-translate', async (_event, { text, from, to }) => {
    if (!text?.trim()) return text

    const apiKey = process.env.DEEPL_API_KEY || ''
    if (!apiKey) {
      console.warn('[Main] DEEPL_API_KEY no configurada')
      return text
    }

    const body = new URLSearchParams({
      auth_key:    apiKey,
      text:        text.trim(),
      source_lang: from.toUpperCase(),
      target_lang: to.toUpperCase() === 'EN' ? 'EN-US' : to.toUpperCase(),
      formality:   'prefer_more',
    }).toString()

    return new Promise((resolve) => {
      const req = net.request({ 
        method: 'POST', 
        url: 'https://api-free.deepl.com/v2/translate' 
      })

      req.setHeader('Content-Type', 'application/x-www-form-urlencoded')
      req.setHeader('Content-Length', Buffer.byteLength(body))

      let respuesta = ''

      req.on('response', (res) => {
        res.on('data', (chunk) => { respuesta += chunk })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(respuesta)
            resolve(parsed.translations?.[0]?.text || text)
          } catch (e) {
            console.error('[Main] Error parseando DeepL:', e.message)
            resolve(text)
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

  ipcMain.handle('get-audio-source', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
      })
      return sources.find(s => s.id.startsWith('screen:')) || sources[0] || null
    } catch (e) {
      console.error('[Main] desktopCapturer falló:', e.message)
      return null
    }
  })
}

// ── Ventana principal ──────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 680, 
    minWidth: 800, minHeight: 500,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return ['media', 'microphone', 'display-capture'].includes(permission)
  })

  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'microphone', 'display-capture'].includes(permission))
  })

  const isDev = !app.isPackaged

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'))
  }
}

// ── Ciclo de vida ──────────────────────────────────────────────────
app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})