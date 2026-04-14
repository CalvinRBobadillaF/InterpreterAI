/**
 * client/startElectronCapture.js
 * ─────────────────────────────────────────────────────────────────
 * Captures system audio via Electron's desktopCapturer.
 *
 * HOW IT WORKS:
 *   1. Main process calls desktopCapturer.getSources() and returns the source id.
 *   2. Renderer calls getUserMedia() with chromeMediaSource: 'desktop' + the source id.
 *   3. We strip the video track → pure audio MediaStream.
 *
 * REQUIREMENT: electronAPI must be exposed via preload.js contextBridge.
 * ─────────────────────────────────────────────────────────────────
 */

export const startElectronCapture = async () => {
  if (!window.electronAPI?.getAudioSource) {
    console.error('[ElectronCapture] electronAPI.getAudioSource not found. Is preload.js loaded?')
    return null
  }

  let source
  try {
    source = await window.electronAPI.getAudioSource()
  } catch (e) {
    console.error('[ElectronCapture] IPC error:', e)
    return null
  }

  if (!source) {
    console.error('[ElectronCapture] No desktop audio source returned from main process.')
    return null
  }

  try {
    // getUserMedia with chromeMediaSource works in Electron's Chromium
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          // Disable audio processing — we want raw system audio
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      },
      // We must request video alongside audio for desktop capture,
      // then immediately discard the video tracks.
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
        },
      },
    })

    // Drop video — we only need audio
    stream.getVideoTracks().forEach(track => track.stop())

    console.log('[ElectronCapture] System audio stream ready.')
    return stream

  } catch (e) {
    console.error('[ElectronCapture] getUserMedia failed:', e)
    return null
  }
}
