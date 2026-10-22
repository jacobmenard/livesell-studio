// The camera as it will be drawn (zoomed and mirrored), shrunk into a small picture: the
// source for the blurred room and for finding the person. Four bilinear taps average a
// box the size of one output pixel, so shrinking doesn't flicker.
precision mediump float;

uniform sampler2D uSampler;
uniform float uZoom;    // 1 = fills the stage, 2 = zoomed in twice
uniform float uMirror;  // 1 = flip left/right
uniform vec2 uSpread;   // a quarter of one output pixel, in camera texture units

varying vec2 vTextureCoord;

vec2 cameraUv(vec2 uv) {
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;
  return 0.5 + (uv - 0.5) / uZoom;
}

void main() {
  vec2 c = cameraUv(vTextureCoord);
  vec3 s = texture2D(uSampler, c + vec2(-uSpread.x, -uSpread.y)).rgb
         + texture2D(uSampler, c + vec2(uSpread.x, -uSpread.y)).rgb
         + texture2D(uSampler, c + vec2(-uSpread.x, uSpread.y)).rgb
         + texture2D(uSampler, c + vec2(uSpread.x, uSpread.y)).rgb;
  gl_FragColor = vec4(s * 0.25, 1.0);
}
