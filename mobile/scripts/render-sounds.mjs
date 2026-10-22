// Renders the 13 built-in sound effects to WAV files for the Android app.
//
// The website synthesizes these in the browser (frontend/src/stage/sounds.ts). The phone
// mixes sound effects into the live's audio natively, so it needs real audio files: this
// script runs the same synthesis offline (node-web-audio-api) and writes 16-bit mono WAVs
// at 44.1 kHz into the native module's assets.
//
//   npm run render-sounds
//
// Randomness (applause, noise bursts) uses a fixed seed, so the files only change when the
// synthesis below changes. To use licensed recordings instead, drop <id>.wav files (16-bit
// PCM) into modules/live-streamer/android/src/main/assets/livestreamer/sounds/.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OfflineAudioContext } from 'node-web-audio-api'

const SAMPLE_RATE = 44_100
const SECONDS = 3.2
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'modules', 'live-streamer', 'android', 'src', 'main', 'assets', 'livestreamer', 'sounds')

const IDS = ['laugh', 'applause', 'bang', 'gun', 'drumroll', 'airhorn', 'kaching', 'ding', 'boo', 'wow', 'crickets', 'rimshot', 'fireworks']

// Mulberry32: a tiny seeded PRNG standing in for Math.random.
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- synthesis: a copy of frontend/src/stage/sounds.ts (keep in step) ------------------

function makeSynth(random) {
  function env(ctx, node, out, t, attack, peak, decay) {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
    node.connect(g)
    g.connect(out)
  }

  function filtered(ctx, src, type, freq, q) {
    if (!type) return src
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq ?? 1000
    if (q) f.Q.value = q
    src.connect(f)
    return f
  }

  function tone(ctx, out, o) {
    const osc = ctx.createOscillator()
    osc.type = o.type ?? 'sine'
    osc.frequency.setValueAtTime(o.f0, o.t)
    if (o.f2 && o.f1) {
      osc.frequency.exponentialRampToValueAtTime(o.f1, o.t + o.dur * 0.35)
      osc.frequency.exponentialRampToValueAtTime(o.f2, o.t + o.dur)
    } else if (o.f1) {
      osc.frequency.exponentialRampToValueAtTime(o.f1, o.t + o.dur)
    }
    const attack = o.attack ?? 0.01
    env(ctx, filtered(ctx, osc, o.filter, o.fq, o.q), out, o.t, attack, o.peak ?? 0.4, o.dur)
    osc.start(o.t)
    osc.stop(o.t + attack + o.dur + 0.05)
  }

  function noise(ctx, out, o) {
    const attack = o.attack ?? 0.002
    const len = Math.max(1, Math.floor(ctx.sampleRate * (attack + o.dur + 0.05)))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    env(ctx, filtered(ctx, src, o.filter, o.fq, o.q), out, o.t, attack, o.peak ?? 0.5, o.dur)
    src.start(o.t)
  }

  return function synth(id, ctx, out, t) {
    switch (id) {
      case 'laugh':
        for (let i = 0; i < 6; i++) {
          const s = t + i * 0.17
          tone(ctx, out, { type: 'sawtooth', f0: 290 - i * 14, f1: 240 - i * 14, t: s, dur: 0.11, peak: 0.35, attack: 0.02, filter: 'bandpass', fq: 1100, q: 1.2 })
          noise(ctx, out, { t: s, dur: 0.08, peak: 0.08, filter: 'bandpass', fq: 2600, q: 1 })
        }
        break
      case 'applause':
        for (let i = 0; i < 90; i++) {
          noise(ctx, out, { t: t + random() * 1.8, dur: 0.035, peak: 0.12 + random() * 0.18, filter: 'bandpass', fq: 1500 + random() * 2500, q: 0.8 })
        }
        break
      case 'bang':
        noise(ctx, out, { t, dur: 0.9, peak: 1, filter: 'lowpass', fq: 900 })
        tone(ctx, out, { f0: 80, f1: 35, t, dur: 0.6, peak: 0.9, attack: 0.003 })
        break
      case 'gun':
        noise(ctx, out, { t, dur: 0.22, peak: 1, filter: 'lowpass', fq: 3200 })
        noise(ctx, out, { t, dur: 0.45, peak: 0.5, filter: 'bandpass', fq: 450, q: 0.7 })
        noise(ctx, out, { t: t + 0.14, dur: 0.35, peak: 0.15, filter: 'lowpass', fq: 1200 })
        break
      case 'drumroll': {
        const n = 28
        for (let i = 0; i < n; i++) {
          noise(ctx, out, { t: t + i * 0.045, dur: 0.04, peak: 0.15 + 0.35 * (i / n), filter: 'bandpass', fq: 320, q: 0.9 })
        }
        noise(ctx, out, { t: t + n * 0.045, dur: 1.3, peak: 0.45, filter: 'highpass', fq: 4500 })
        tone(ctx, out, { f0: 90, f1: 45, t: t + n * 0.045, dur: 0.4, peak: 0.6 })
        break
      }
      case 'airhorn':
        for (const d of [0, 0.45]) {
          for (const f of [440, 554, 659]) {
            const osc = ctx.createOscillator()
            osc.type = 'sawtooth'
            osc.frequency.value = f
            const g = ctx.createGain()
            const s = t + d
            g.gain.setValueAtTime(0, s)
            g.gain.linearRampToValueAtTime(0.12, s + 0.02)
            g.gain.setValueAtTime(0.12, s + 0.32)
            g.gain.linearRampToValueAtTime(0, s + 0.4)
            filtered(ctx, osc, 'lowpass', 2600).connect(g)
            g.connect(out)
            osc.start(s)
            osc.stop(s + 0.45)
          }
        }
        break
      case 'kaching':
        noise(ctx, out, { t, dur: 0.05, peak: 0.4, filter: 'highpass', fq: 3000 })
        tone(ctx, out, { f0: 1568, t: t + 0.05, dur: 0.6, peak: 0.35, attack: 0.003 })
        tone(ctx, out, { f0: 2093, t: t + 0.13, dur: 0.9, peak: 0.35, attack: 0.003 })
        break
      case 'ding':
        tone(ctx, out, { f0: 1320, t, dur: 1.3, peak: 0.5, attack: 0.003 })
        tone(ctx, out, { f0: 2640, t, dur: 0.6, peak: 0.12, attack: 0.003 })
        break
      case 'boo':
        tone(ctx, out, { type: 'sawtooth', f0: 170, f1: 110, t, dur: 1.1, peak: 0.4, attack: 0.12, filter: 'lowpass', fq: 650 })
        tone(ctx, out, { type: 'sawtooth', f0: 175, f1: 113, t, dur: 1.1, peak: 0.3, attack: 0.12, filter: 'lowpass', fq: 650 })
        break
      case 'wow':
        tone(ctx, out, { type: 'sawtooth', f0: 210, f1: 430, f2: 250, t, dur: 0.9, peak: 0.4, attack: 0.05, filter: 'bandpass', fq: 900, q: 1.5 })
        break
      case 'crickets':
        for (let c = 0; c < 3; c++) {
          for (let i = 0; i < 4; i++) {
            tone(ctx, out, { f0: 4400, t: t + c * 0.55 + i * 0.045, dur: 0.025, peak: 0.12, attack: 0.004 })
          }
        }
        break
      case 'rimshot':
        tone(ctx, out, { f0: 190, f1: 95, t, dur: 0.18, peak: 0.6, attack: 0.003 })
        tone(ctx, out, { f0: 150, f1: 70, t: t + 0.22, dur: 0.2, peak: 0.6, attack: 0.003 })
        noise(ctx, out, { t: t + 0.45, dur: 0.7, peak: 0.35, filter: 'highpass', fq: 6000 })
        break
      case 'fireworks':
        tone(ctx, out, { f0: 600, f1: 2200, t, dur: 0.7, peak: 0.12, attack: 0.05 })
        noise(ctx, out, { t: t + 0.75, dur: 0.7, peak: 0.9, filter: 'lowpass', fq: 1200 })
        tone(ctx, out, { f0: 70, f1: 35, t: t + 0.75, dur: 0.5, peak: 0.7, attack: 0.003 })
        for (let i = 0; i < 26; i++) {
          noise(ctx, out, { t: t + 0.9 + random() * 1.1, dur: 0.02, peak: 0.12 + random() * 0.12, filter: 'highpass', fq: 3000 })
        }
        break
      default:
        throw new Error(`Unknown sound ${id}`)
    }
  }
}

// ---- rendering and WAV output ----------------------------------------------------------

function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    data.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

/** Drops the silent tail (keeps a short fade so nothing clicks). */
function trim(samples) {
  let end = samples.length
  while (end > 0 && Math.abs(samples[end - 1]) < 0.0008) end--
  end = Math.min(samples.length, end + Math.round(SAMPLE_RATE * 0.03))
  return samples.slice(0, Math.max(end, 1))
}

async function render(id, index) {
  const ctx = new OfflineAudioContext(1, Math.round(SAMPLE_RATE * SECONDS), SAMPLE_RATE)
  const out = ctx.createGain()
  out.gain.value = 1
  out.connect(ctx.destination)
  makeSynth(seeded(0x5eed + index))(id, ctx, out, 0.02)
  const buffer = await ctx.startRendering()
  let samples = trim(Float32Array.from(buffer.getChannelData(0)))
  // Same loudness as the website, except that nothing may clip in the 16-bit file.
  const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  if (peak > 0.97) samples = samples.map((v) => (v / peak) * 0.97)
  return { samples, peak }
}

mkdirSync(OUT, { recursive: true })
for (const [index, id] of IDS.entries()) {
  const { samples, peak } = await render(id, index)
  writeFileSync(join(OUT, `${id}.wav`), toWav(samples))
  console.log(`${id.padEnd(10)} ${(samples.length / SAMPLE_RATE).toFixed(2)} s  peak ${peak.toFixed(2)}`)
}
console.log(`Wrote ${IDS.length} sounds to ${OUT}`)
