import type { BuiltinSoundId } from '../lib/types'

/**
 * Sound effects. Built-in pads are synthesized in the browser so the app works with
 * no audio files; drop licensed recordings into /public/sounds/<id>.mp3 and they are
 * used instead (see SOUND_FILES). Sellers' own uploads play from their URL.
 */

/** Map a pad to a licensed recording, e.g. { kaching: '/sounds/kaching.mp3' }. */
export const SOUND_FILES: Partial<Record<BuiltinSoundId, string>> = {}

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (!context) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    context = new AC()
  }
  if (context.state === 'suspended') void context.resume()
  return context
}

/** Browsers start audio only after a click; call this from any user gesture. */
export function unlockAudio(): void {
  audio()
}

/** Plays a sound. Volume is 0–100. Resolves false if the browser refused to play it. */
export async function playSound(sound: BuiltinSoundId | { url: string }, volume: number): Promise<boolean> {
  const gain = Math.min(1, Math.max(0, volume / 100))
  if (gain <= 0) return true

  const url = typeof sound === 'string' ? SOUND_FILES[sound] : sound.url
  if (url) {
    try {
      const el = new Audio(url)
      el.volume = gain
      await el.play()
      return true
    } catch {
      return false
    }
  }

  const ctx = audio()
  if (!ctx) return false
  try {
    const out = ctx.createGain()
    out.gain.value = gain
    out.connect(ctx.destination)
    synth(sound as BuiltinSoundId, ctx, out, ctx.currentTime + 0.02)
    return ctx.state !== 'suspended'
  } catch {
    return false
  }
}

// ---- synthesis -------------------------------------------------------------

function env(ctx: AudioContext, node: AudioNode, out: AudioNode, t: number, attack: number, peak: number, decay: number) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  node.connect(g)
  g.connect(out)
}

function filtered(ctx: AudioContext, src: AudioNode, type?: BiquadFilterType, freq?: number, q?: number): AudioNode {
  if (!type) return src
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq ?? 1000
  if (q) f.Q.value = q
  src.connect(f)
  return f
}

interface ToneOptions {
  type?: OscillatorType
  f0: number
  f1?: number
  f2?: number
  t: number
  dur: number
  peak?: number
  attack?: number
  filter?: BiquadFilterType
  fq?: number
  q?: number
}

function tone(ctx: AudioContext, out: AudioNode, o: ToneOptions) {
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

interface NoiseOptions {
  t: number
  dur: number
  peak?: number
  attack?: number
  filter?: BiquadFilterType
  fq?: number
  q?: number
}

function noise(ctx: AudioContext, out: AudioNode, o: NoiseOptions) {
  const attack = o.attack ?? 0.002
  const len = Math.max(1, Math.floor(ctx.sampleRate * (attack + o.dur + 0.05)))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  env(ctx, filtered(ctx, src, o.filter, o.fq, o.q), out, o.t, attack, o.peak ?? 0.5, o.dur)
  src.start(o.t)
}

function synth(id: BuiltinSoundId, ctx: AudioContext, out: AudioNode, t: number) {
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
        noise(ctx, out, { t: t + Math.random() * 1.8, dur: 0.035, peak: 0.12 + Math.random() * 0.18, filter: 'bandpass', fq: 1500 + Math.random() * 2500, q: 0.8 })
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
        noise(ctx, out, { t: t + 0.9 + Math.random() * 1.1, dur: 0.02, peak: 0.12 + Math.random() * 0.12, filter: 'highpass', fq: 3000 })
      }
      break
  }
}
