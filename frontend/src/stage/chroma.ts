/**
 * Green / blue screen keying on the GPU (WebGL). Pixels close to the key color in
 * chroma space become transparent; "edge smoothness" widens the soft edge, and a
 * small spill fix stops green fringes on hair and shoulders.
 */
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
uniform vec3 u_key;
uniform float u_similarity;
uniform float u_smoothness;
varying vec2 v_uv;

vec2 chroma(vec3 c) {
  return vec2(
    c.r * -0.169 + c.g * -0.331 + c.b * 0.5 + 0.5,
    c.r * 0.5 + c.g * -0.419 + c.b * -0.081 + 0.5
  );
}

void main() {
  vec4 c = texture2D(u_tex, v_uv);
  float d = distance(chroma(c.rgb), chroma(u_key));
  float a = smoothstep(u_similarity, u_similarity + u_smoothness, d);
  // Spill suppression: pull the key channel down towards the other two.
  vec3 rgb = c.rgb;
  if (u_key.g > u_key.b) rgb.g = min(rgb.g, max(rgb.r, rgb.b) + 0.05);
  else rgb.b = min(rgb.b, max(rgb.r, rgb.g) + 0.05);
  gl_FragColor = vec4(rgb * a, a);
}`

export class ChromaKeyer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private texture: WebGLTexture
  private uniforms: { key: WebGLUniformLocation; similarity: WebGLUniformLocation; smoothness: WebGLUniformLocation }

  /** Throws when WebGL isn't available; callers fall back to the unkeyed camera. */
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
    this.uniforms = { key: loc('u_key'), similarity: loc('u_similarity'), smoothness: loc('u_smoothness') }
  }

  /**
   * Keys one video frame. Similarity and smoothness are the 0–100 slider values.
   * Returns the canvas holding the keyed frame (same size as the video).
   */
  render(video: HTMLVideoElement, key: [number, number, number], similarity: number, smoothness: number): HTMLCanvasElement {
    const { gl } = this
    if (this.canvas.width !== video.videoWidth || this.canvas.height !== video.videoHeight) {
      this.canvas.width = video.videoWidth
      this.canvas.height = video.videoHeight
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    gl.uniform3f(this.uniforms.key, key[0], key[1], key[2])
    gl.uniform1f(this.uniforms.similarity, 0.02 + (similarity / 100) * 0.38)
    gl.uniform1f(this.uniforms.smoothness, 0.002 + (smoothness / 100) * 0.2)
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
