'use strict'

const chalk = require('chalk')

/**
 * Logs a new device connection
 */
const logConnection = (message) => {
  const time = new Date().toLocaleTimeString()
  console.log(chalk.green(`📱 [${time}] New connection detected`))
}

/**
 * Logs general info message
 */
const logInfo = (message) => {
  const time = new Date().toLocaleTimeString()
  console.log(chalk.blue(`ℹ️  [${time}] ${message}`))
}

/**
 * Logs a warning message
 */
const logWarning = (message) => {
  const time = new Date().toLocaleTimeString()
  console.log(chalk.yellow(`⚠️  [${time}] ${message}`))
}

module.exports = { logConnection, logInfo, logWarning }
