// main.js
const { app, BrowserWindow, ipcMain } = require('electron')
const { net } = require('electron')

ipcMain.handle('translate', async (event, { text, from, to, apiKey }) => {
  console.log('[Main] Translation request:', { text, from, to, hasKey: !!apiKey })
  
  try {
    const url = 'https://api-free.deepl.com/v2/translate'
    
    const body = new URLSearchParams({
      auth_key: apiKey,
      text: text,
      source_lang: from.toUpperCase(),
      target_lang: to.toUpperCase() === 'EN' ? 'EN-US' : to.toUpperCase(),
    }).toString()

    return new Promise((resolve, reject) => {
      const request = net.request({
        method: 'POST',
        url: url,
      })

      request.setHeader('Content-Type', 'application/x-www-form-urlencoded')
      
      let responseData = ''

      request.on('response', (response) => {
        console.log('[Main] Response status:', response.statusCode)
        
        response.on('data', (chunk) => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          try {
            console.log('[Main] Response data:', responseData)
            const parsed = JSON.parse(responseData)
            
            if (response.statusCode === 200) {
              resolve(parsed.translations?.[0]?.text || text)
            } else {
              console.error('[Main] DeepL API error:', parsed)
              reject(new Error(parsed.message || 'Translation failed'))
            }
          } catch (e) {
            console.error('[Main] JSON parse error:', e)
            reject(e)
          }
        })
      })

      request.on('error', (error) => {
        console.error('[Main] Request error:', error)
        reject(error)
      })

      request.write(body)
      request.end()
    })
  } catch (error) {
    console.error('[Main] Translation handler error:', error)
    throw error
  }
})