'use strict'

const { Tunnel } = require('cloudflared/lib/tunnel.js')

let activeTunnel = null

/**
 * Starts a Cloudflare quick tunnel
 * Returns the public HTTPS URL as a string
 */
const startTunnel = (port) => {
  return new Promise((resolve, reject) => {
    activeTunnel = Tunnel.quick(`http://localhost:${port}`)

    activeTunnel.once('url', (url) => {
      resolve(url)
    })

    activeTunnel.on('stderr', (output) => {
      if (output.includes('GET') || output.includes('POST')) {
        const { logConnection } = require('./logger')
        logConnection(output)
      }
    })

    activeTunnel.once('exit', (code) => {
      reject(new Error(`Tunnel closed unexpectedly with code ${code}`))
    })

    activeTunnel.once('error', (err) => {
      reject(new Error(`Cloudflare tunnel failed: ${err.message}`))
    })

    setTimeout(() => {
      reject(new Error('Timed out waiting for tunnel URL. Check your internet connection.'))
    }, 30000)
  })
}

/**
 * Stops the running Cloudflare tunnel
 */
const stopTunnel = () => {
  return new Promise((resolve) => {
    if (activeTunnel) {
      activeTunnel.stop()
      activeTunnel = null
    }
    resolve()
  })
}

module.exports = { startTunnel, stopTunnel }
