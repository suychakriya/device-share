'use strict'

const qrcode = require('qrcode-terminal')

/**
 * Prints a QR code to the terminal
 * User can scan this with their phone camera
 */
const showQR = (url) => {
  qrcode.generate(url, { small: true })
  console.log()
}

module.exports = { showQR }
