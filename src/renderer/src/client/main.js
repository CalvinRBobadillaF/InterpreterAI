

/*
Main.js

*/




const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron')
const path = require('path')

// ── IPC HANDLERS ─────────────────────────────────────────────────────────────

// 🔊 Obtener una pantalla (para audio del sistema)
ipcMain.handle('get-audio-source', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }
    })

    const source = sources.find(s => s.id.startsWith('screen')) || sources[0]

    if (!source) return null

    return {
      id: source.id,
      name: source.name
    }

  } catch (error) {
    console.error('❌ desktopCapturer error:', error)
    return null
  }
})

// 🔥 FIX: ESTE FALTABA (muy importante)
ipcMain.handle('get-all-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 }
    })

    return sources.map(s => ({
      id: s.id,
      name: s.name
    }))
  } catch (err) {
    console.error('❌ get-all-sources error:', err)
    return []
  }
})

// ── WINDOW ───────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 680,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const ses = win.webContents.session

  // CSP
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; media-src * blob:"
        ]
      }
    })
  })

  // Permisos
  ses.setPermissionCheckHandler((webContents, permission) => {
    return ['media', 'microphone', 'camera', 'display-capture'].includes(permission)
  })

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(['media', 'microphone', 'camera', 'display-capture'].includes(permission))
  })

  win.loadURL('http://localhost:5173')
  win.webContents.openDevTools()
}

// ── APP ─────────────────────────────────────────────────────────────

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})