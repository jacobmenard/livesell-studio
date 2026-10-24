// Builds the signed release APK you publish on the website.
//
//   npm run build:apk -- https://api.negosyoworks.tech
//
// The API address is baked into the app when Gradle bundles the JavaScript, not when prebuild
// runs, and a value in .env or .env.local (often a LAN address for testing) wins unless the
// variable is set for that step too. A shell prefix like `EXPO_PUBLIC_API_URL=… npx expo
// prebuild` therefore ships the wrong server. This script sets APP_ENV and EXPO_PUBLIC_API_URL
// for both steps, checks the server answers before the long build, and checks the finished
// bundle talks to that server before you upload it.

import { spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'

const apiUrl = (process.argv[2] ?? '').replace(/\/+$/, '')
if (!/^https:\/\/[^/\s]+$/.test(apiUrl)) {
  fail('Give the API address, for example:  npm run build:apk -- https://api.negosyoworks.tech')
}

await checkServer(apiUrl)

const env = { ...process.env, APP_ENV: 'production', EXPO_PUBLIC_API_URL: apiUrl }
run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean'], root)
// A full path: Windows doesn't always look in the current folder for commands.
const gradlew = join(root, 'android', windows ? 'gradlew.bat' : 'gradlew')
run(windows ? `"${gradlew}"` : gradlew, ['assembleRelease'], join(root, 'android'))

const bundle = join(root, 'android/app/build/generated/assets/react/release/index.android.bundle')
const apk = join(root, 'android/app/build/outputs/apk/release/app-release.apk')
if (!readFileSync(bundle).includes(Buffer.from(apiUrl))) {
  fail(`The built app does not contain ${apiUrl}. Don't publish it; check mobile/.env* and build again.`)
}
const sizeMb = Math.round(statSync(apk).size / 1_000_000)
console.log(`\nBuilt ${apk}\nAPI: ${apiUrl} · ${sizeMb} MB (ANDROID_APP_SIZE_MB=${sizeMb})`)

/** The app's own first call: a server that doesn't answer it here won't answer phones either. */
async function checkServer(url) {
  const endpoint = `${url}/api/mobile/version`
  try {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    const body = await response.json()
    if (!response.ok || !body?.data) throw new Error(`HTTP ${response.status}`)
  } catch (error) {
    fail(`${endpoint} didn't answer (${error instanceof Error ? error.message : error}). Check the address.`)
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: windows })
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed (exit ${result.status}).`)
}

function fail(message) {
  console.error(`\n${message}`)
  process.exit(1)
}
