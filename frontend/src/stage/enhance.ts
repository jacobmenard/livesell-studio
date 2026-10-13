/**
 * Camera look: brightness, contrast, saturation, warmth and face smoothing, applied to each
 * camera frame on the GPU (WebGL). Face smoothing is an edge-preserving blur limited to
 * skin-coloured pixels, with a soft glow: skin looks even while eyes, lips, hair and the
 * products on show stay sharp. No face detection, so nothing extra to download.
 */

/** The camera's look settings (0–100 sliders; 50 = unchanged, smoothing 0 = off). */
export interface CameraLook {
  brightness: number
  contrast: number
  saturation: number
  warmth: number
  smoothing: number
}

export const NEUTRAL_LOOK: CameraLook = { brightness: 50, contrast: 50, saturation: 50, warmth: 50, smoothing: 0 }

/** One-tap starting points in the Camera step; the sliders fine-tune from there. */
export const LOOK_PRESETS: { id: string; label: string; look: CameraLook }[] = [
  { id: 'natural', label: 'Natural', look: NEUTRAL_LOOK },
  { id: 'bright', label: 'Bright', look: { brightness: 60, contrast: 55, saturation: 55, warmth: 50, smoothing: 20 } },
  { id: 'warm', label: 'Warm', look: { brightness: 55, contrast: 52, saturation: 56, warmth: 66, smoothing: 30 } },
  { id: 'glow', label: 'Soft glow', look: { brightness: 56, contrast: 47, saturation: 52, warmth: 56, smoothing: 65 } },
]

export function isNeutralLook(look: CameraLook): boolean {
  return (Object.keys(NEUTRAL_LOOK) as (keyof CameraLook)[]).every((k) => look[k] === NEUTRAL_LOOK[k])
}

export function sameLook(a: CameraLook, b: CameraLook): boolean {
  return (Object.keys(NEUTRAL_LOOK) as (keyof CameraLook)[]).every((k) => a[k] === b[k])
}

/**
 * The same adjustments as a canvas filter, for when WebGL isn't available (warmth and
 * smoothing need the GPU, so they're left out there).
 */
export function lookAsCssFilter(look: CameraLook): string {
  const brightness = (0.5 + look.brightness / 100).toFixed(2)
  const contrast = (0.5 + look.contrast / 100).toFixed(2)
  const saturate = (look.saturation / 50).toFixed(2)
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`
}

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) / 2.0, 1.0 - (a_pos.y + 1.0) / 2.0);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_step;        // smoothing radius, in texture coordinates
uniform float u_brightness; // multiplier, 0.5–1.5
uniform float u_contrast;   // 0.5–1.5
uniform float u_saturation; // 0–2
uniform float u_warmth;     // −1–1
uniform float u_smoothing;  // 0–1
varying vec2 v_uv;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// How much a colour looks like skin (any skin tone): chroma in YCbCr, ignoring very dark pixels.
float skin(vec3 c) {
  float cb = dot(c, vec3(-0.169, -0.331, 0.5)) + 0.5;
  float cr = dot(c, vec3(0.5, -0.419, -0.081)) + 0.5;
  float inCr = smoothstep(0.50, 0.545, cr) * (1.0 - smoothstep(0.665, 0.71, cr));
  float inCb = smoothstep(0.27, 0.31, cb) * (1.0 - smoothstep(0.50, 0.54, cb));
  return inCr * inCb * smoothstep(0.08, 0.2, dot(c, LUMA));
}

// Edge-preserving blur: neighbours that look different (an eye, an edge) barely count.
vec3 bilateral(vec3 center) {
  vec3 sum = center;
  float total = 1.0;
  for (int ring = 1; ring <= 2; ring++) {
    float r = float(ring);
    float spatial = ring == 1 ? 1.0 : 0.55;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398 + r * 0.3927;
      vec3 s = texture2D(u_tex, v_uv + vec2(cos(a), sin(a)) * u_step * r).rgb;
      vec3 d = s - center;
      float w = spatial * exp(-dot(d, d) * 90.0);
      sum += s * w;
      total += w;
    }
  }
  return sum / total;
}

void main() {
  vec4 texel = texture2D(u_tex, v_uv);
  vec3 c = texel.rgb;

  if (u_smoothing > 0.0) {
    float k = skin(c) * u_smoothing;
    if (k > 0.0) {
      c = mix(c, bilateral(c), min(1.0, k * 1.15));
      c += (1.0 - c) * k * 0.06; // a soft glow on the skin
    }
  }

  c *= u_brightness;
  c = (c - 0.5) * u_contrast + 0.5;
  c = mix(vec3(dot(c, LUMA)), c, u_saturation);
  c += vec3(0.06, 0.015, -0.06) * u_warmth;

  c = clamp(c, 0.0, 1.0);
  gl_FragColor = vec4(c * texel.a, texel.a);
}`

/** Applies a CameraLook to camera frames. Throws when WebGL isn't available. */
export class Enhancer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private texture: WebGLTexture
  private uniforms: Record<'step' | 'brightness' | 'contrast' | 'saturation' | 'warmth' | 'smoothing', WebGLUniformLocation>

  constructor() {
    this.canvas = document.createElement('canvas')
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: false })
    if (!gl) throw new Error('WebGL is not available')
    this.gl = gl

    const program = gl.createProgram()
    if (!program) throw new Error('Could not create WebGL program')
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, FRAGMENT],
    ] as const) {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Could not create shader')
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader error')
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Link error')
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const pos = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

    const texture = gl.createTexture()
    if (!texture) throw new Error('Could not create texture')
    this.texture = texture
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    const loc = (name: string) => {
      const l = gl.getUniformLocation(program, name)
      if (!l) throw new Error(`Missing uniform ${name}`)
      return l
    }
    this.uniforms = {
      step: loc('u_step'),
      brightness: loc('u_brightness'),
      contrast: loc('u_contrast'),
      saturation: loc('u_saturation'),
      warmth: loc('u_warmth'),
      smoothing: loc('u_smoothing'),
    }
  }

  /**
   * One frame with the look applied, as a canvas the same size as the source (a camera
   * video, or the green-screen keyer's output, whose transparency is kept).
   */
  render(source: HTMLVideoElement | HTMLCanvasElement, width: number, height: number, look: CameraLook): HTMLCanvasElement {
    const { gl } = this
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    gl.viewport(0, 0, width, height)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    // About 5 px at 1080p, so the effect looks the same at any camera resolution.
    const radius = Math.max(2, height / 216)
    gl.uniform2f(this.uniforms.step, radius / width, radius / height)
    gl.uniform1f(this.uniforms.brightness, 0.5 + look.brightness / 100)
    gl.uniform1f(this.uniforms.contrast, 0.5 + look.contrast / 100)
    gl.uniform1f(this.uniforms.saturation, look.saturation / 50)
    gl.uniform1f(this.uniforms.warmth, (look.warmth - 50) / 50)
    gl.uniform1f(this.uniforms.smoothing, look.smoothing / 100)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    return this.canvas
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture)
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
