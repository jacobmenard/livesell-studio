import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { explainFfmpegError, ffmpegArgs, isConnectionRefusal, outputFormat, redact, retryMessage, streamTarget } from './lib.mjs'

describe('streamTarget', () => {
  it('appends the key to a server URL that ends with a slash (Facebook)', () => {
    assert.equal(streamTarget('rtmps://live-api-s.facebook.com:443/rtmp/', 'FB-123'), 'rtmps://live-api-s.facebook.com:443/rtmp/FB-123')
  })

  it('adds the slash when the server URL has none (YouTube)', () => {
    assert.equal(streamTarget('rtmp://a.rtmp.youtube.com/live2', 'abcd-efgh'), 'rtmp://a.rtmp.youtube.com/live2/abcd-efgh')
  })

  it('refuses anything that is not rtmp:// or rtmps://', () => {
    assert.throws(() => streamTarget('https://example.com/live', 'k'), /rtmp:\/\//)
    assert.throws(() => streamTarget('file:///etc/passwd', 'k'), /rtmp:\/\//)
    assert.throws(() => streamTarget('not a url', 'k'), /not valid/)
  })

  it('refuses a missing or broken key', () => {
    assert.throws(() => streamTarget('rtmp://a.rtmp.youtube.com/live2', ''), /stream key/)
    assert.throws(() => streamTarget('rtmp://a.rtmp.youtube.com/live2', 'a b'), /stream key/)
  })
})

describe('outputFormat', () => {
  it('turns shape and quality into a frame size and bitrate', () => {
    assert.deepEqual(outputFormat('portrait', '1080p'), { width: 1080, height: 1920, kbps: 4500 })
    assert.deepEqual(outputFormat('landscape', '720p'), { width: 1280, height: 720, kbps: 3000 })
  })
})

describe('ffmpegArgs', () => {
  it('reads WebM from stdin and publishes FLV with a 2-second keyframe interval', () => {
    const args = ffmpegArgs('rtmps://host/app/key', { width: 1080, height: 1920, kbps: 4500 })
    assert.equal(args[args.indexOf('-i') + 1], 'pipe:0')
    assert.equal(args[args.indexOf('-g') + 1], '60')
    assert.equal(args[args.indexOf('-f') + 1], 'flv')
    assert.equal(args.at(-1), 'rtmps://host/app/key')
    assert.match(args[args.indexOf('-vf') + 1], /scale=1080:1920/)
  })
})

describe('redact', () => {
  it('hides every occurrence of every secret', () => {
    assert.equal(redact('rtmps://x/rtmp/KEY1: I/O error (KEY1)', ['KEY1', '', undefined]), 'rtmps://x/rtmp/••••: I/O error (••••)')
  })
})

describe('explainFfmpegError', () => {
  it('explains a refused connection in the platform’s name', () => {
    assert.match(explainFfmpegError(['rtmps://x/rtmp/••••: Input/output error'], 'facebook'), /^Facebook didn’t accept the stream/)
    assert.match(explainFfmpegError(['rtmps://x/rtmp/••••: Input/output error'], 'facebook'), /persistent stream key/)
    assert.doesNotMatch(explainFfmpegError(['rtmp://x/live2/••••: Input/output error'], 'youtube'), /Live Producer/)
  })

  // Exactly what FFmpeg 7 printed when Facebook refused a reconnect right after a live.
  const facebookRefusal = [
    '[tls @ 000001dd241ace40] A TLS fatal alert has been received.',
    '[out#0/flv @ 000001dd241b5040] Error opening output rtmps://live-api-s.facebook.com:443/rtmp/••••: I/O error',
    'Error opening output file rtmps://live-api-s.facebook.com:443/rtmp/••••.',
    'Error opening output files: I/O error',
  ]

  it('understands newer FFmpeg wording ("I/O error", TLS alert)', () => {
    assert.match(explainFfmpegError(facebookRefusal, 'facebook'), /^Facebook didn’t accept the stream/)
  })

  it('points at a missing rtmps build', () => {
    assert.match(explainFfmpegError(['rtmps://x: Protocol not found'], 'youtube'), /full FFmpeg build/)
  })

  it('falls back to the last line', () => {
    assert.equal(explainFfmpegError(['something odd'], 'custom'), 'FFmpeg stopped: something odd')
  })

  it('treats a refused connection as worth retrying, but not a broken FFmpeg or bad input', () => {
    assert.equal(isConnectionRefusal(facebookRefusal), true)
    assert.equal(isConnectionRefusal(['rtmp://x: Connection refused']), true)
    assert.equal(isConnectionRefusal(['rtmps://x: Protocol not found']), false)
    assert.equal(isConnectionRefusal(['pipe:0: Invalid data found when processing input']), false)
    assert.equal(isConnectionRefusal([]), false)
  })

  it('says it is trying again in the platform’s name', () => {
    assert.match(retryMessage('facebook'), /^Facebook didn’t accept the stream yet.*Trying again/)
  })
})
