'use strict'

const os = require('os')

/**
 * Returns the machine's local network IPv4 address (e.g. 192.168.1.x)
 * Returns null if not found
 */
const getLocalIP = () => {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return null
}

module.exports = { getLocalIP }
