import { createClient } from '@deepgram/sdk'

export function createDeepgramSocket(apiKey, onMessage) {
  const deepgram = createClient(apiKey)

  const connection = deepgram.listen.live({
    model: 'nova-2',
    language: 'en-US', // ⚠️ importante
    punctuate: true,
    interim_results: true,
    smart_format: true,
  })

  connection.on('open', () => {
    console.log('🟢 Deepgram connected')
  })

  connection.on('error', (err) => {
    console.error('🔴 Deepgram error:', err)
  })

  connection.on('transcript', (data) => {
    const alt = data.channel?.alternatives?.[0]
    if (!alt) return

    onMessage({
      text: alt.transcript,
      isFinal: data.is_final,
      lang: alt.languages?.[0] || 'unknown'
    })
  })

  return connection
}