// Copies MediaPipe's WebAssembly runtime into public/ so background removal works
// offline and from our own domain (no third-party CDN at runtime).
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const from = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const to = resolve(root, 'public/mediapipe/wasm')

if (!existsSync(from)) {
  console.error('[copy-mediapipe] @mediapipe/tasks-vision is not installed. Run npm install first.')
  process.exit(1)
}

mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
console.log('[copy-mediapipe] copied MediaPipe wasm to public/mediapipe/wasm')
