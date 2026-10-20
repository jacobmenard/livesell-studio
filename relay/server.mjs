/**
 * NegosyoWork Studio relay: browsers can't speak RTMP, so the clean screen sends its
 * recorded picture and sound here over a WebSocket, and FFmpeg publishes it to
 * Facebook / YouTube (or any RTMP/RTMPS server the seller saved).
 *
 * Protocol (one WebSocket per live, at /relay?ticket=…):
 *   1. The relay swaps the one-time ticket with Laravel for the server URL and key
 *      (authenticated with RELAY_SECRET; the browser never sees the key).
 *   2. It starts FFmpeg and sends {"type":"status","state":"ready"}.
 *   3. The browser then sends WebM chunks as binary messages.
 *   4. Status updates follow: "live" once FFmpeg is publishing, then "ended" or "error".
 * Closing the socket (Stop, or the window closing) ends the live.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { explainFfmpegError, ffmpegArgs, isConnectionRefusal, outputFormat, redact, retryMessage, streamTarget } from './lib.mjs'

const PORT = Number(process.env.RELAY_PORT || 8090)
// Loopback only by default: the Vite dev server (or your web server) proxies /relay here.
const HOST = process.env.RELAY_HOST || '127.0.0.1'
const SECRET = process.env.RELAY_SECRET || ''
const LARAVEL_URL = (process.env.LARAVEL_URL || 'http://localhost:8000').replace(/\/+$/, '')
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
// When the platform refuses the stream before it goes live, try again after these pauses
// (about 20 s in all: Facebook can hold a just-ended live's connection for a few seconds).
const RETRY_DELAYS_MS = [3000, 6000, 10000]
// Video kept for a retry while waiting (≈ 60 s at the browser's 8 Mbit/s).
const MAX_BACKLOG_BYTES = 64 * 1024 * 1024

if (!SECRET) {
  console.error('[relay] RELAY_SECRET is not set. Copy .env.example to .env and use the same value as backend/.env.')
  process.exit(1)
}

/** Asks Laravel what a ticket is for. Each ticket works once. */
async function claimTicket(ticket) {
  const res = await fetch(`${LARAVEL_URL}/api/relay/claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 401) throw new Error('The relay and the app use different RELAY_SECRET values. Make them match and restart both.')
  if (!res.ok) throw new Error(body.message || `The app refused to start streaming (${res.status}).`)
  return body.data
}

async function handleLive(ws, ticket) {
  const send = (state, message = '') => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'status', state, message }))
  }
  const fail = (message) => {
    send('error', message)
    ws.close(1011, 'error')
  }

  let destination
  try {
    destination = await claimTicket(ticket)
  } catch (error) {
    return fail(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The app did not answer. Is php artisan serve running?')
  }
  if (ws.readyState !== ws.OPEN) return

  let target
  try {
    target = streamTarget(destination.server_url, destination.stream_key)
  } catch (error) {
    return fail(error.message)
  }
  const secrets = [destination.stream_key, SECRET]
  const label = `${destination.platform} ${destination.orientation} ${destination.resolution}`
  const args = ffmpegArgs(target, outputFormat(destination.orientation, destination.resolution))
  const attempts = RETRY_DELAYS_MS.length + 1

  let ffmpeg = null
  let accepting = false // the current FFmpeg has had the backlog and takes new chunks
  let live = false
  let stopping = false
  let attempt = 0
  let retryTimer
  // Everything recorded until the platform accepts the stream, so a retry can start the
  // video from its beginning (FFmpeg needs the WebM header). Dropped once live.
  let backlog = []
  let backlogBytes = 0

  const write = (data) => {
    // Let FFmpeg set the pace: stop reading from the browser until it catches up.
    if (!ffmpeg.stdin.write(data)) {
      ws.pause()
      ffmpeg.stdin.once('drain', () => ws.resume())
    }
  }

  const start = () => {
    attempt += 1
    const proc = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    ffmpeg = proc
    let errorTail = []

    proc.on('error', (error) => {
        console.error(`[relay] FFmpeg could not start at "${FFMPEG}": ${error.message}. Install it (apt install ffmpeg) or fix FFMPEG_PATH in relay/.env, then restart the relay.`)
      // Shown to the seller, but only the server's admin can fix it.
      fail(
        error.code === 'ENOENT'
          ? 'Streaming straight isn’t available right now: the streaming server can’t find FFmpeg. Please tell the NegosyoWork team (or use OBS / TikTok LIVE Studio meanwhile).'
          : `FFmpeg could not start: ${error.message}`,
      )
    })
    proc.stdout.setEncoding('utf8').on('data', (chunk) => {
      if (!live && chunk.includes('progress=continue')) {
        live = true
        backlog = []
        backlogBytes = 0
        console.log(`[relay] live: ${label}`)
        send('live')
      }
    })
    proc.stderr.setEncoding('utf8').on('data', (chunk) => {
      errorTail = [...errorTail, ...redact(chunk, secrets).split(/\r?\n/).filter(Boolean)].slice(-8)
    })
    // EPIPE when FFmpeg exits first; the close handler reports why.
    proc.stdin.on('error', () => {})

    // Only ask for video once FFmpeg is really running (a missing FFmpeg fails above instead).
    proc.once('spawn', () => {
      console.log(`[relay] starting: ${label}${attempt > 1 ? ` (try ${attempt} of ${attempts})` : ''}`)
      for (const chunk of backlog) proc.stdin.write(chunk)
      accepting = true
      if (attempt === 1) send('ready')
    })

    proc.on('close', (code) => {
      accepting = false
      console.log(`[relay] ended: ${label} (FFmpeg exit ${code})`)
      if (errorTail.length) console.log(`[relay] ${errorTail.join('\n[relay] ')}`)
      ws.resume() // a paused socket would never resume once this FFmpeg is gone
      if (ws.readyState !== ws.OPEN) return
      if (code === 0 || stopping) {
        send('ended')
        ws.close(1000)
        return
      }
      // The platform refused to open the stream: right after a live ends it can still be
      // holding the old connection for a few seconds. Keep recording and try again.
      if (!live && attempt < attempts && isConnectionRefusal(errorTail)) {
        const delay = RETRY_DELAYS_MS[attempt - 1]
        console.log(`[relay] retrying in ${delay / 1000} s: ${label}`)
        send('connecting', retryMessage(destination.platform))
        retryTimer = setTimeout(() => !stopping && ws.readyState === ws.OPEN && start(), delay)
        return
      }
      fail(explainFfmpegError(errorTail, destination.platform))
    })
  }

  ws.on('message', (data, isBinary) => {
    if (!isBinary || stopping) return
    if (!live) {
      backlog.push(data)
      backlogBytes += data.length
      // Still not accepted after this long: explain it as the refusal it is.
      if (backlogBytes > MAX_BACKLOG_BYTES) return fail(explainFfmpegError(['Error opening output'], destination.platform))
    }
    if (accepting) write(data)
  })
  ws.on('close', () => {
    stopping = true
    clearTimeout(retryTimer)
    backlog = []
    if (!ffmpeg || ffmpeg.exitCode !== null) return
    // Ending stdin lets FFmpeg flush and close the stream cleanly; force it after 5 s.
    const proc = ffmpeg
    proc.stdin.end()
    setTimeout(() => proc.exitCode === null && proc.kill(), 5000).unref()
  })

  start()
}

const server = createServer((req, res) => {
  if (req.url === '/relay/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  res.writeHead(404).end()
})

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://relay.local')
  const ticket = url.searchParams.get('ticket') ?? ''
  if (url.pathname !== '/relay' || !/^[A-Za-z0-9]{48}$/.test(ticket)) {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => void handleLive(ws, ticket))
})

// Check FFmpeg once at start, so a missing install shows up here rather than on the first live.
const probe = spawnSync(FFMPEG, ['-hide_banner', '-protocols'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 })
if (probe.error) {
  console.warn(`[relay] FFmpeg not found (${FFMPEG}). Install it (winget install --id Gyan.FFmpeg) or set FFMPEG_PATH in .env, then restart the relay.`)
} else if (!/^\s*rtmps\s*$/m.test(probe.stdout)) {
  console.warn('[relay] This FFmpeg can’t stream to rtmps:// (Facebook needs it). Install a full build, e.g. winget install --id Gyan.FFmpeg.')
}

server.listen(PORT, HOST, () => {
  console.log(`[relay] listening on ws://${HOST}:${PORT}/relay (app: ${LARAVEL_URL}, ffmpeg: ${FFMPEG})`)
})
