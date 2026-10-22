// The camera picture for the live: zoom and mirror, the seller's look (brightness, contrast,
// colour, warmth, face enhance), the colour filter, and the background (none, blurred room,
// picture behind the person, or green screen).
//
// The look, filter and face-enhance maths are copied from the website's
// frontend/src/stage/enhance.ts and the keying from frontend/src/stage/chroma.ts, so a setup
// looks the same on the phone and on the website. Keep them in step.
//
// Texture conventions: uSampler and uBlur are drawn by OpenGL (row 0 at the bottom, like
// vTextureCoord); uMask and uBackground come from pictures (row 0 at the top), so they are
// read with the y axis flipped.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uSampler;     // the camera, full size
uniform sampler2D uBlur;        // the camera as drawn, blurred, small
uniform sampler2D uMask;        // how sure we are each pixel is the person (0–1)
uniform sampler2D uBackground;  // the picture shown behind the person

uniform float uMode;            // 0 none, 1 blur, 2 picture, 3 green screen
uniform float uHasMask;         // 1 once the first person mask has arrived
uniform float uHasBackground;   // 1 once the picture has loaded
uniform vec3 uTone;             // shown until the picture loads
uniform vec2 uBgScale;          // the part of the picture that fills the stage ("cover")

uniform float uZoom;
uniform float uMirror;

uniform vec2 uStep;             // face-enhance radius, in camera texture units
uniform float uBrightness;      // 0.5–1.5
uniform float uContrast;        // 0.5–1.5
uniform float uSaturation;      // 0–2
uniform float uWarmth;          // −1–1
uniform float uSmoothing;       // 0–1

uniform float uFStrength;       // colour filter, 0 = off
uniform vec3 uFGain;
uniform float uFContrast;
uniform float uFSaturation;
uniform float uFFade;
uniform vec3 uFShadows;
uniform vec3 uFHighlights;
uniform float uFMono;
uniform float uFVignette;
uniform float uFGrain;
uniform float uSeed;            // changes every frame, so film grain moves

uniform vec3 uKey;              // green screen colour
uniform float uSimilarity;
uniform float uSmoothness;

varying vec2 vTextureCoord;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec2 cameraUv(vec2 uv) {
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;
  return 0.5 + (uv - 0.5) / uZoom;
}

// ---- enhance.ts ------------------------------------------------------------------------

// How much a colour looks like skin (any skin tone): chroma in YCbCr, ignoring very dark pixels.
float skin(vec3 c) {
  float cb = dot(c, vec3(-0.169, -0.331, 0.5)) + 0.5;
  float cr = dot(c, vec3(0.5, -0.419, -0.081)) + 0.5;
  float inCr = smoothstep(0.50, 0.545, cr) * (1.0 - smoothstep(0.665, 0.71, cr));
  float inCb = smoothstep(0.27, 0.31, cb) * (1.0 - smoothstep(0.50, 0.54, cb));
  return inCr * inCb * smoothstep(0.08, 0.2, dot(c, LUMA));
}

// Edge-preserving blur: neighbours that look different (an eye, an edge) barely count.
vec3 bilateral(vec3 center, vec2 at) {
  vec3 sum = center;
  float total = 1.0;
  for (int ring = 1; ring <= 2; ring++) {
    float r = float(ring);
    float spatial = ring == 1 ? 1.0 : 0.55;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398 + r * 0.3927;
      vec3 s = texture2D(uSampler, at + vec2(cos(a), sin(a)) * uStep * r).rgb;
      vec3 d = s - center;
      float w = spatial * exp(-dot(d, d) * 90.0);
      sum += s * w;
      total += w;
    }
  }
  return sum / total;
}

vec3 enhanceSkin(vec3 c, vec2 at) {
  if (uSmoothing > 0.0) {
    float k = skin(c) * uSmoothing;
    if (k > 0.0) {
      c = mix(c, bilateral(c, at), min(1.0, k * 1.15));
      c += (1.0 - c) * k * 0.06; // a soft glow on the skin
    }
  }
  return c;
}

vec3 grade(vec3 c, vec2 uv) {
  c *= uBrightness;
  c = (c - 0.5) * uContrast + 0.5;
  c = mix(vec3(dot(c, LUMA)), c, uSaturation);
  c += vec3(0.06, 0.015, -0.06) * uWarmth;
  c = clamp(c, 0.0, 1.0);

  if (uFStrength > 0.0) {
    vec3 g = c * uFGain;
    g = (g - 0.5) * uFContrast + 0.5;
    float l = clamp(dot(g, LUMA), 0.0, 1.0);
    g = mix(vec3(l), g, uFSaturation);
    g = mix(g, vec3(l), uFMono);
    g += uFShadows * (1.0 - l) + uFHighlights * l;
    // Fade: blacks lifted, whites softened, like old film.
    g = mix(vec3(uFFade), vec3(1.0 - uFFade * 0.3), clamp(g, 0.0, 1.0));
    g *= 1.0 - uFVignette * smoothstep(0.3, 0.85, distance(uv, vec2(0.5)));
    float noise = fract(sin(dot(uv * 1000.0 + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
    g += (noise - 0.5) * uFGrain;
    c = mix(c, clamp(g, 0.0, 1.0), uFStrength);
  }
  return c;
}

// ---- chroma.ts -------------------------------------------------------------------------

vec2 chroma(vec3 c) {
  return vec2(
    c.r * -0.169 + c.g * -0.331 + c.b * 0.5 + 0.5,
    c.r * 0.5 + c.g * -0.419 + c.b * -0.081 + 0.5
  );
}

// ---- backgrounds -----------------------------------------------------------------------

// The person mask turned into a soft edge (geometry.ts maskAlpha).
float personAlpha(vec2 uv) {
  float confidence = texture2D(uMask, vec2(uv.x, 1.0 - uv.y)).r;
  return clamp((confidence - 0.25) / 0.5, 0.0, 1.0);
}

vec3 picture(vec2 uv) {
  if (uHasBackground < 0.5) return uTone;
  vec2 p = 0.5 + (uv - 0.5) * uBgScale;
  return texture2D(uBackground, vec2(p.x, 1.0 - p.y)).rgb;
}

void main() {
  vec2 uv = vTextureCoord;
  vec2 at = cameraUv(uv);
  vec3 camera = texture2D(uSampler, at).rgb;

  float keep = 1.0;
  if (uMode > 2.5) {
    keep = smoothstep(uSimilarity, uSimilarity + uSmoothness, distance(chroma(camera), chroma(uKey)));
    // Spill suppression: pull the key channel down towards the other two.
    if (uKey.g > uKey.b) camera.g = min(camera.g, max(camera.r, camera.b) + 0.05);
    else camera.b = min(camera.b, max(camera.r, camera.g) + 0.05);
  }

  vec3 person = grade(enhanceSkin(camera, at), uv);
  if (uMode < 0.5) {
    gl_FragColor = vec4(person, 1.0);
    return;
  }

  vec3 back;
  if (uMode < 1.5) {
    // The blurred room keeps the look (the website blurs the already-graded frame).
    back = grade(texture2D(uBlur, uv).rgb, uv);
    keep = uHasMask > 0.5 ? personAlpha(uv) : 0.0;
  } else {
    back = picture(uv);
    // Picture: until the first mask arrives, never hide the seller.
    if (uMode < 2.5) keep = uHasMask > 0.5 ? personAlpha(uv) : 1.0;
  }
  gl_FragColor = vec4(mix(back, person, keep), 1.0);
}
