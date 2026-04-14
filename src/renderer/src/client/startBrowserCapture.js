/**
 * client/startBrowserCapture.js
 * ─────────────────────────────────────────────────────────────────
 * Captures audio from a browser tab or screen using the
 * Screen Capture API (getDisplayMedia).
 *
 * HOW IT WORKS:
 *   - Browser shows a native picker: user selects a tab/window/screen.
 *   - If the user checks "Share tab audio", audio track is included.
 *   - We stop the video track immediately to avoid screen recording.
 *
 * LIMITATION: The user must manually click "Share" in the browser dialog.
 * This cannot be automated — it requires a user gesture.
 * ─────────────────────────────────────────────────────────────────
 */

export const startBrowserCapture = async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 44100,
      },
      // We request video so the dialog appears, but discard it.
      // Some browsers require video: true for getDisplayMedia.
      video: true,
    })

    // Discard video tracks immediately
    stream.getVideoTracks().forEach(track => track.stop())

    // Check if audio was actually shared (user may have left it unchecked)
    if (stream.getAudioTracks().length === 0) {
      console.warn('[BrowserCapture] No audio track — user may not have checked "Share tab audio".')
      return null
    }

    console.log('[BrowserCapture] Tab audio stream ready.')
    return stream

  } catch (e) {
    if (e.name === 'NotAllowedError') {
      console.warn('[BrowserCapture] User cancelled the screen share dialog.')
    } else {
      console.error('[BrowserCapture] getDisplayMedia failed:', e)
    }
    return null
  }
}
