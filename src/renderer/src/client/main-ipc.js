/**
 * main-ipc.js
 * ─────────────────────────────────────────────────────────────────
 * ADD THESE HANDLERS to your existing main.js / index.js (Electron main process).
 * desktopCapturer must run in the main process (Electron 13+).
 *
 * Example main.js setup:
 *
 *   const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron')
 *   require('./main-ipc')   ← or just paste the handlers below
 * ─────────────────────────────────────────────────────────────────
 */

const { ipcMain, desktopCapturer } = require('electron')

// Returns the first screen source (system audio)
ipcMain.handle('get-audio-source', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 }, // skip thumbnails for speed
  })
  // Prefer 'Entire Screen' / first screen source
  return sources.find(s => s.id.startsWith('screen')) || sources[0] || null
})

// Returns all screen + window sources (for a picker UI)
ipcMain.handle('get-all-sources', async () => {
  return desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 150, height: 100 },
  })
})
