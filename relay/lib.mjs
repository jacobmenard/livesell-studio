/**
 * Pure helpers for the relay: where FFmpeg publishes, with which settings, and how its
 * errors are explained to the seller. Kept free of I/O so they can be unit tested.
 */

/** Output size and video bitrate (kbps) per quality, within Facebook's and YouTube's 30 fps advice. */
const QUALITY = {
  '1080p': { long: 1920, short: 1080, kbps: 4500 },
  '720p': { long: 1280, short: 720, kbps: 3000 },
}

const PLATFORM_NAMES = { facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' }

export function outputFormat(orientation, resolution) {
  const { long, short, kbps } = QUALITY[resolution] ?? QUALITY['1080p']
  const [width, height] = orientation === 'portrait' ? [short, long] : [long, short]
  return { width, height, kbps }
}

/** The URL FFmpeg publishes to: the saved server URL with the stream key appended. */
export function streamTarget(serverUrl, key) {
  const server = String(serverUrl ?? '').trim()
  let protocol
  try {
    protocol = new URL(server).protocol
  } catch {
    throw new Error('The saved server URL is not valid. Save it again in Go live.')
  }
  if (protocol !== 'rtmp:' && protocol !== 'rtmps:') {
    throw new Error('The server URL must start with rtmp:// or rtmps://.')
  }
  if (!key || /\s/.test(key)) throw new Error('The saved stream key is missing or invalid. Save it again in Go live.')
  return server.endsWith('/') ? server + key : `${server}/${key}`
}

/**
 * FFmpeg arguments: the browser's WebM on stdin, H.264 + AAC in FLV out to the platform.
 * Progress goes to stdout (so "live" can be detected at any log level), errors to stderr.
 */
export function ffmpegArgs(target, { width, height, kbps }) {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostats',
    '-progress', 'pipe:1',
    '-fflags', '+genpts',
    '-i', 'pipe:0',
    // A fixed frame whatever size the captured tab is: scale to fit, pad the rest.
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-b:v', `${kbps}k`,
    '-maxrate', `${kbps}k`,
    '-bufsize', `${kbps * 2}k`,
    // A keyframe every 2 seconds, which Facebook and YouTube require.
    '-g', '60',
    '-keyint_min', '60',
    '-sc_threshold', '0',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '48000',
    '-ac', '2',
    '-f', 'flv',
    target,
  ]
}

/** Replaces secrets (the stream key, the relay secret) in text that may be shown or logged. */
export function redact(text, secrets) {
  return secrets.filter((s) => typeof s === 'string' && s.length > 0).reduce((out, s) => out.split(s).join('••••'), String(text))
}

// The platform refused or dropped the connection (wording differs between FFmpeg builds:
// "Input/output error" or "I/O error", and a TLS alert when an rtmps server hangs up).
const CONNECTION_ERROR = /Input\/output error|I\/O error|TLS fatal alert|Error opening output|Connection refused|Connection reset|Connection timed out|Broken pipe|End of file|Server returned|Failed to update header|Cannot open connection/i

/**
 * Whether FFmpeg stopped because the platform wouldn't open the stream (worth a retry
 * before going live), rather than a problem on this computer.
 */
export function isConnectionRefusal(lines) {
  const text = lines.join('\n')
  return CONNECTION_ERROR.test(text) && !/Protocol not found|Unknown protocol/i.test(text)
}

/** Shown while the relay waits to try the platform again. */
export function retryMessage(platform) {
  const name = PLATFORM_NAMES[platform] ?? 'The streaming server'
  return `${name} didn’t accept the stream yet (it can take a few seconds after a live ends). Trying again…`
}

/** FFmpeg's last error lines (already redacted) turned into something a seller can act on. */
export function explainFfmpegError(lines, platform) {
  const text = lines.join('\n')
  const name = PLATFORM_NAMES[platform] ?? 'The streaming server'
  if (/Protocol not found|Unknown protocol|https? protocol not found/i.test(text)) {
    return 'This FFmpeg can’t stream to rtmps://. Install a full FFmpeg build (for example from gyan.dev) and restart the relay.'
  }
  if (/Invalid data found when processing input|EBML header parsing failed/i.test(text)) {
    return 'FFmpeg couldn’t read the video from the browser. Start streaming again.'
  }
  if (CONNECTION_ERROR.test(text)) {
    const where = platform === 'facebook' ? ' (in Live Producer, turn on “Use a persistent stream key” so it stops changing)' : ''
    return `${name} didn’t accept the stream. If you just ended a live, wait about 30 seconds and start again. If it keeps happening, copy the current stream key from ${name}${where}, save it in Go live and try again.`
  }
  return lines.at(-1) ? `FFmpeg stopped: ${lines.at(-1)}` : 'FFmpeg stopped unexpectedly. Start streaming again.'
}
