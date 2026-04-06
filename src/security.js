'use strict'

const crypto = require('crypto')

/**
 * Generates a random 8-character password
 * Example output: a3f9b2c1
 */
const generatePassword = () => {
  return crypto.randomBytes(4).toString('hex')
}

/**
 * Auto-closes tunnel after N minutes
 * Calls the callback when time is up
 */
const setExpiry = (minutes, callback) => {
  const ms = minutes * 60 * 1000
  setTimeout(callback, ms)
}

module.exports = { generatePassword, setExpiry }
