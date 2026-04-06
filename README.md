# dev-share

Share your localhost with a QR code — instantly, securely.

```bash
npx dev-share --port 3000
```

Scan the QR code on your phone. Done.

---

## Install

```bash
npm install -g dev-share
```

Or use without installing:

```bash
npx dev-share --port 3000
```

---

## Usage

```
dev-share --port <port> [options]

Options:
  --port <port>       Local port to share (required)
  --tunnel            Share via Cloudflare tunnel (cross-network, avoid with real APIs)
  --expires <minutes> Auto-close after N minutes (default: 60)
  --no-password       Disable password protection
  --help              Show help
```

---

## Modes

### Local network (recommended)

Best for most use cases — testing on your phone, apps with real APIs, apps with auth tokens or user data.

```bash
dev-share --port 5173
```

- Traffic stays on your local network — nothing goes through a third party
- Safe to use with real APIs, auth tokens, and real user data
- Password protected by default
- Supports WebSocket (Vite HMR, Next.js fast refresh work normally)
- Requires phone and laptop to be on the same WiFi

### Tunnel (Cloudflare)

Use only for sharing static frontends with no real data, or when same-network access is not possible.

```bash
dev-share --port 5173 --tunnel
```

- Creates a public HTTPS URL via Cloudflare Quick Tunnel
- Password protected by default
- ⚠️ Cloudflare terminates TLS — they can see all requests, responses, and auth tokens
- **Do not use with real APIs or real user data**

---

## Security

### Password protection

A random password is generated each session and displayed in your terminal. Anyone opening the URL sees a password prompt — no username required.

```
🔑 Password: a3f9b2c1
```

To disable (not recommended):

```bash
dev-share --port 3000 --no-password
```

### Rate limiting

After 10 failed password attempts, an IP is locked out for 15 minutes.

### Auto-expiry

The session closes automatically after 60 minutes by default.

```bash
dev-share --port 3000 --expires 30
```

---

## Which mode should I use?

| Situation | Recommended |
|---|---|
| App uses real APIs or auth tokens | `--local` |
| App has real user data | `--local` |
| Testing on your phone (same WiFi) | `--local` |
| Sharing static frontend with no real data | Tunnel (default) |
| Sharing with someone on a different network | Tunnel (default) — avoid real APIs |

---

## Requirements

- Node.js 16+
- For tunnel mode: internet connection + `cloudflared` (installed automatically)
- For local mode: phone and laptop on the same WiFi

---

## License

MIT
