// One direction of a Gaussian blur (run across, then down) on the small camera picture.
// Nine taps with sigma = 2 taps; uDir spaces the taps so the blur matches the website's
// CSS blur (stage width / 90).
precision mediump float;

uniform sampler2D uSampler;
uniform vec2 uDir;

varying vec2 vTextureCoord;

void main() {
  vec2 uv = vTextureCoord;
  vec3 s = texture2D(uSampler, uv).rgb * 0.2042;
  s += (texture2D(uSampler, uv + uDir).rgb + texture2D(uSampler, uv - uDir).rgb) * 0.1802;
  s += (texture2D(uSampler, uv + uDir * 2.0).rgb + texture2D(uSampler, uv - uDir * 2.0).rgb) * 0.1238;
  s += (texture2D(uSampler, uv + uDir * 3.0).rgb + texture2D(uSampler, uv - uDir * 3.0).rgb) * 0.0663;
  s += (texture2D(uSampler, uv + uDir * 4.0).rgb + texture2D(uSampler, uv - uDir * 4.0).rgb) * 0.0276;
  gl_FragColor = vec4(s, 1.0);
}
