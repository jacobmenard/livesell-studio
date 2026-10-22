// The same vertex stage as RootEncoder's filters (simple_vertex.glsl): a full-screen quad.
attribute vec4 aPosition;
attribute vec4 aTextureCoord;

uniform mat4 uMVPMatrix;
uniform mat4 uSTMatrix;

varying vec2 vTextureCoord;

void main() {
  gl_Position = uMVPMatrix * aPosition;
  vTextureCoord = (uSTMatrix * aTextureCoord).xy;
}
