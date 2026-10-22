// Signs release APKs with NegosyoWork's own upload key instead of the public debug key.
//
// The generated android/ folder signs release builds with debug.keystore, whose password is
// public: anyone could then sign a fake "update". This plugin makes `assembleRelease` use the
// key named in your Gradle properties (never in the repository), and fails the build when
// they are missing rather than quietly using the debug key.
//
// Put these in ~/.gradle/gradle.properties on the build computer (see README):
//   NEGOSYOWORK_UPLOAD_STORE_FILE=/absolute/path/negosyowork-upload.jks
//   NEGOSYOWORK_UPLOAD_STORE_PASSWORD=...
//   NEGOSYOWORK_UPLOAD_KEY_ALIAS=negosyowork
//   NEGOSYOWORK_UPLOAD_KEY_PASSWORD=...
const { withAppBuildGradle } = require('expo/config-plugins')

const MARKER = '// negosyowork-release-signing'

const SIGNING_BLOCK = `
        release { ${MARKER}
            if (project.hasProperty('NEGOSYOWORK_UPLOAD_STORE_FILE')) {
                storeFile file(NEGOSYOWORK_UPLOAD_STORE_FILE)
                storePassword NEGOSYOWORK_UPLOAD_STORE_PASSWORD
                keyAlias NEGOSYOWORK_UPLOAD_KEY_ALIAS
                keyPassword NEGOSYOWORK_UPLOAD_KEY_PASSWORD
            }
        }`

function apply(gradle) {
  if (gradle.includes(MARKER)) return gradle

  const signingStart = gradle.indexOf('signingConfigs {')
  const debugStart = gradle.indexOf('debug {', signingStart)
  const debugEnd = gradle.indexOf('}', debugStart)
  if (signingStart < 0 || debugStart < 0 || debugEnd < 0) {
    throw new Error('withReleaseSigning: signingConfigs { debug { … } } not found in android/app/build.gradle')
  }
  let out = gradle.slice(0, debugEnd + 1) + SIGNING_BLOCK + gradle.slice(debugEnd + 1)

  const releaseType = out.indexOf('release {', out.indexOf('buildTypes {'))
  const debugSigning = out.indexOf('signingConfig signingConfigs.debug', releaseType)
  if (releaseType < 0 || debugSigning < 0) {
    throw new Error('withReleaseSigning: buildTypes { release { signingConfig … } } not found in android/app/build.gradle')
  }
  out =
    out.slice(0, debugSigning) +
    'signingConfig signingConfigs.release // without the NEGOSYOWORK_UPLOAD_* properties the release build fails on purpose' +
    out.slice(debugSigning + 'signingConfig signingConfigs.debug'.length)
  return out
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('withReleaseSigning: expected a Groovy build.gradle')
    mod.modResults.contents = apply(mod.modResults.contents)
    return mod
  })
}

module.exports.apply = apply
