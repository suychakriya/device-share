'use strict'

const http = require('http')
const net = require('net')
const crypto = require('crypto')
const chalk = require('chalk')

const getFreePort = () => {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

const parseCookies = (header = '') => {
  return Object.fromEntries(
    header.split(';').map(c => {
      const [k, ...rest] = c.trim().split('=')
      return [k, rest.join('=')]
    })
  )
}

// Rate limiting: max 10 failed attempts per IP per 15 minutes
const attempts = new Map()
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 15 * 60 * 1000

const isRateLimited = (ip) => {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) return false
  return entry.count >= RATE_LIMIT
}

const recordFailedAttempt = (ip) => {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
  } else {
    entry.count++
  }
}

const clearAttempts = (ip) => attempts.delete(ip)

const passwordForm = (error = false, rateLimited = false) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>device-share — enter password</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .box { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.1); width: 100%; max-width: 320px; }
    h2 { margin: 0 0 1.5rem; font-size: 1.2rem; }
    input[type=password] { width: 100%; box-sizing: border-box; padding: .6rem .8rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 8px; margin-bottom: .8rem; }
    button { width: 100%; padding: .6rem; font-size: 1rem; background: #0070f3; color: white; border: none; border-radius: 8px; cursor: pointer; }
    button:hover { background: #005fd1; }
    .error { color: #e00; font-size: .85rem; margin-bottom: .8rem; }
    .warn  { color: #a60; font-size: .85rem; margin-bottom: .8rem; }
  </style>
</head>
<body>
  <div class="box">
    <h2>🔒 Enter password to continue</h2>
    ${rateLimited ? '<p class="warn">Too many attempts. Try again in 15 minutes.</p>' : ''}
    ${error ? '<p class="error">Incorrect password, try again.</p>' : ''}
    <form method="POST" action="/__auth">
      <input type="password" name="password" placeholder="Password" autofocus ${rateLimited ? 'disabled' : ''} required>
      <button type="submit" ${rateLimited ? 'disabled' : ''}>Unlock</button>
    </form>
  </div>
</body>
</html>`

/**
 * Starts an HTTP proxy with password form, rate limiting, and WebSocket support.
 *
 * @param {number} targetPort - The local port to forward to
 * @param {string} password - The password to enforce
 * @param {object} options
 * @param {string} options.bindAddress - '127.0.0.1' for tunnel mode, '0.0.0.0' for local network mode
 * @param {boolean} options.secureCookie - Set Secure flag on cookie (use true when behind HTTPS)
 */
const startProxy = (targetPort, password, { bindAddress = '127.0.0.1', secureCookie = true } = {}) => {
  return new Promise(async (resolve, reject) => {
    const proxyPort = await getFreePort()
    const tokenSecret = crypto.randomBytes(32).toString('hex')
    const authToken = crypto.createHmac('sha256', tokenSecret).update(password).digest('hex')

    const isAuthed = (req) => {
      const cookies = parseCookies(req.headers['cookie'] || '')
      return cookies['__ds_auth'] === authToken
    }

    const cookieFlags = `HttpOnly; SameSite=Strict${secureCookie ? '; Secure' : ''}`
    const seenIPs = new Set()

    const server = http.createServer((req, res) => {
      const ip = req.socket.remoteAddress

      // Handle login form submission
      if (req.method === 'POST' && req.url === '/__auth') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          if (isRateLimited(ip)) {
            res.writeHead(429, { 'Content-Type': 'text/html' })
            return res.end(passwordForm(false, true))
          }

          const params = new URLSearchParams(body)
          if (params.get('password') === password) {
            clearAttempts(ip)
            res.writeHead(302, {
              'Set-Cookie': `__ds_auth=${authToken}; ${cookieFlags}`,
              'Location': '/',
            })
            return res.end()
          }

          recordFailedAttempt(ip)
          res.writeHead(200, { 'Content-Type': 'text/html' })
          return res.end(passwordForm(true))
        })
        return
      }

      // Show login form if not authed
      if (!isAuthed(req)) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        return res.end(passwordForm())
      }

      // Log new device connections
      if (!seenIPs.has(ip)) {
        seenIPs.add(ip)
        const time = new Date().toLocaleTimeString()
        console.log(chalk.green(`📱 [${time}] New device connected from ${ip}`))
      }

      // Forward to target
      const options = {
        hostname: '127.0.0.1',
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `localhost:${targetPort}` },
      }

      const proxy = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      })

      proxy.on('error', () => {
        res.writeHead(502)
        res.end('Bad Gateway')
      })

      req.pipe(proxy)
    })

    // WebSocket proxy support (needed for Vite HMR, Next.js, etc.)
    server.on('upgrade', (req, socket, head) => {
      if (!isAuthed(req)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      const time = new Date().toLocaleTimeString()
      console.log(chalk.cyan(`  WS ${req.url} — connected [${time}]`))

      const conn = net.connect(targetPort, '127.0.0.1', () => {
        let rawRequest = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`
        for (const [k, v] of Object.entries(req.headers)) {
          rawRequest += `${k}: ${v}\r\n`
        }
        rawRequest += '\r\n'
        conn.write(rawRequest)
        if (head && head.length > 0) conn.write(head)
        conn.pipe(socket)
        socket.pipe(conn)
      })

      conn.on('error', () => socket.destroy())
      socket.on('error', () => conn.destroy())
    })

    server.listen(proxyPort, bindAddress, () => resolve({ server, proxyPort }))
    server.on('error', reject)
  })
}

module.exports = { startProxy }
