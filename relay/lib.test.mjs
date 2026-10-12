import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { explainFfmpegError, ffmpegArgs, outputFormat, redact, streamTarget } from './lib.mjs'

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
    assert.match(explainFfmpegError(['rtmps://x/rtmp/••••: Input/output error'], 'facebook'), /^Facebook closed the connection/)
  })

  it('points at a missing rtmps build', () => {
    assert.match(explainFfmpegError(['rtmps://x: Protocol not found'], 'youtube'), /full FFmpeg build/)
  })

  it('falls back to the last line', () => {
    assert.equal(explainFfmpegError(['something odd'], 'custom'), 'FFmpeg stopped: something odd')
  })
})
