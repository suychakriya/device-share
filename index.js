#!/usr/bin/env node

'use strict'

const { program } = require('commander')
const chalk = require('chalk')
const { startTunnel, stopTunnel } = require('./src/tunnel')
const { generatePassword, setExpiry } = require('./src/security')
const { startProxy } = require('./src/proxy')
const { getLocalIP } = require('./src/network')
const { showQR } = require('./src/qrcode')
const { logInfo } = require('./src/logger')

const DEFAULT_EXPIRY_MINUTES = 60

program
  .name('device-share')
  .description('Share your localhost securely with a QR code')
  .version('1.0.0')
  .requiredOption('--port <port>', 'Local port to share (e.g. 3000)')
  .option('--expires <minutes>', 'Auto-close after N minutes', String(DEFAULT_EXPIRY_MINUTES))
  .option('--no-password', 'Disable password protection (not recommended)')
  .option('--tunnel', 'Share via Cloudflare tunnel (cross-network, avoid with real APIs)')

program.action(async (options) => {
  const port = parseInt(options.port)
  const expiryMinutes = parseInt(options.expires)

  if (isNaN(port) || port < 1 || port > 65535) {
    console.log(chalk.red('❌ Invalid port number. Please use a number between 1 and 65535.'))
    process.exit(1)
  }

  const isLocal = !options.tunnel

  if (isLocal) {
    const localIP = getLocalIP()
    if (!localIP) {
      console.log(chalk.red('❌ Could not detect local network IP. Are you connected to a network?'))
      process.exit(1)
    }

    console.log(chalk.yellow(`
╔══════════════════════════════════════════════╗
║         📡 LOCAL NETWORK MODE                ║
║                                              ║
║  Only devices on your WiFi can connect.      ║
║  No traffic goes through Cloudflare.         ║
║  Press CTRL+C at any time to stop sharing    ║
╚══════════════════════════════════════════════╝
    `))

    let password = null
    let proxyServer = null
    let sharePort = port

    if (options.password !== false) {
      password = generatePassword()
      console.log(chalk.cyan(`🔑 Password: ${chalk.bold(password)}`))
      console.log(chalk.gray('   Share this password with anyone who needs access\n'))

      try {
        const proxy = await startProxy(port, password, { bindAddress: '0.0.0.0', secureCookie: false })
        proxyServer = proxy.server
        sharePort = proxy.proxyPort
      } catch (err) {
        console.log(chalk.red(`❌ Failed to start auth proxy: ${err.message}`))
        process.exit(1)
      }
    }

    const shareUrl = `http://${localIP}:${sharePort}`

    console.log(chalk.green(`\n✅ Sharing on local network!`))
    console.log(chalk.white(`🔗 URL:      ${chalk.bold(shareUrl)}`))
    console.log(chalk.white(`🔑 Password: ${chalk.bold(password || 'disabled')}`))
    console.log(chalk.white(`⏰ Expires:  ${chalk.bold(expiryMinutes + ' minutes')}\n`))

    console.log(chalk.yellow('📱 Scan this QR code on your device:'))
    showQR(shareUrl)

    console.log(chalk.blue('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
    console.log(chalk.blue('👀 Activity Log — waiting for connections...'))
    console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'))

    const cleanup = () => {
      if (proxyServer) proxyServer.close()
    }

    setExpiry(expiryMinutes, () => {
      console.log(chalk.yellow(`\n⏰ Sharing expired after ${expiryMinutes} minutes`))
      cleanup()
      console.log(chalk.green('✅ Sharing stopped automatically'))
      process.exit(0)
    })

    process.on('SIGINT', () => {
      console.log(chalk.red('\n\n🛑 Stopping...'))
      cleanup()
      console.log(chalk.green('✅ Sharing stopped safely. Goodbye!'))
      process.exit(0)
    })

    return
  }

  // Tunnel mode (Cloudflare)
  console.log(chalk.yellow(`
╔══════════════════════════════════════════════╗
║           ⚠️  SECURITY WARNING               ║
║                                              ║
║  This will expose port ${String(port).padEnd(5)} to the internet  ║
║  Only share the URL with people you trust!   ║
║  Press CTRL+C at any time to stop sharing    ║
╚══════════════════════════════════════════════╝
  `))

  let password = null
  let proxyServer = null
  let tunnelPort = port

  if (options.password !== false) {
    password = generatePassword()
    console.log(chalk.cyan(`🔑 Password: ${chalk.bold(password)}`))
    console.log(chalk.gray('   Share this password with anyone who needs access\n'))

    try {
      const proxy = await startProxy(port, password, { bindAddress: '127.0.0.1', secureCookie: true })
      proxyServer = proxy.server
      tunnelPort = proxy.proxyPort
    } catch (err) {
      console.log(chalk.red(`❌ Failed to start auth proxy: ${err.message}`))
      process.exit(1)
    }
  }

  logInfo('Starting Cloudflare tunnel...')
  let tunnelUrl

  try {
    tunnelUrl = await startTunnel(tunnelPort)
  } catch (err) {
    console.log(chalk.red(`❌ Failed to start tunnel: ${err.message}`))
    process.exit(1)
  }

  console.log(chalk.green(`\n✅ Tunnel is live!`))
  console.log(chalk.white(`🔗 URL:      ${chalk.bold(tunnelUrl)}`))
  console.log(chalk.white(`🔑 Password: ${chalk.bold(password || 'disabled')}`))
  console.log(chalk.white(`⏰ Expires:  ${chalk.bold(expiryMinutes + ' minutes')}\n`))

  console.log(chalk.yellow('📱 Scan this QR code on your device:'))
  showQR(tunnelUrl)

  console.log(chalk.blue('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log(chalk.blue('👀 Activity Log — waiting for connections...'))
  console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'))

  const cleanup = async () => {
    await stopTunnel()
    if (proxyServer) proxyServer.close()
  }

  setExpiry(expiryMinutes, async () => {
    console.log(chalk.yellow(`\n⏰ Tunnel expired after ${expiryMinutes} minutes`))
    await cleanup()
    console.log(chalk.green('✅ Tunnel closed automatically'))
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    console.log(chalk.red('\n\n🛑 Stopping tunnel...'))
    await cleanup()
    console.log(chalk.green('✅ Tunnel closed safely. Goodbye!'))
    process.exit(0)
  })
})

program.parse()
