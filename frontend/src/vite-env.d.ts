/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin when it differs from the SPA's (leave empty to use the same origin). */
  readonly VITE_API_URL?: string
  readonly VITE_REVERB_APP_KEY?: string
  readonly VITE_REVERB_HOST?: string
  readonly VITE_REVERB_PORT?: string
  readonly VITE_REVERB_SCHEME?: string
  /** Where the background-removal model is loaded from (self-host it in production). */
  readonly VITE_SEGMENTER_MODEL_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
