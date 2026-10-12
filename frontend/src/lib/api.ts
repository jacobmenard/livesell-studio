import axios, { AxiosError, isAxiosError, type AxiosRequestConfig } from 'axios'

/**
 * One HTTP client for the Laravel API. Sanctum's SPA flow: a cookie session plus the
 * XSRF-TOKEN cookie, which axios echoes back in the X-XSRF-TOKEN header.
 */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  timeout: 20_000,
})

let csrfReady: Promise<void> | null = null

function hasXsrfCookie(): boolean {
  return typeof document !== 'undefined' && document.cookie.split('; ').some((c) => c.startsWith('XSRF-TOKEN='))
}

/** Makes sure the CSRF cookie exists before the first state-changing request. */
export function ensureCsrf(force = false): Promise<void> {
  if (!force && hasXsrfCookie()) return Promise.resolve()
  if (!csrfReady || force) {
    csrfReady = http
      .get('/sanctum/csrf-cookie')
      .then(() => undefined)
      .finally(() => {
        csrfReady = null
      })
  }
  return csrfReady
}

http.interceptors.request.use(async (config) => {
  const method = (config.method ?? 'get').toLowerCase()
  if (!['get', 'head', 'options'].includes(method) && !config.url?.startsWith('/sanctum/')) {
    await ensureCsrf()
  }
  return config
})

// A 419 means the CSRF token expired (e.g. a tab left open overnight): refresh it once and retry.
http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as (AxiosRequestConfig & { csrfRetried?: boolean }) | undefined
  if (error.response?.status === 419 && config && !config.csrfRetried) {
    config.csrfRetried = true
    await ensureCsrf(true)
    return http.request(config)
  }
  throw error
})

export type FieldErrors = Record<string, string>

/** Laravel's 422 body → { field: first message }. */
export function fieldErrors(error: unknown): FieldErrors {
  if (isAxiosError(error) && error.response?.status === 422) {
    const errors = (error.response.data as { errors?: Record<string, string[]> })?.errors ?? {}
    return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0] ?? 'Check this field.']))
  }
  return {}
}

/** A short, human message for any failed request. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (isAxiosError(error)) {
    if (!error.response) return "We couldn't reach the server. Check your connection and try again."
    const status = error.response.status
    const data = error.response.data as { message?: string; errors?: Record<string, string[]> } | undefined
    if (status === 422) {
      const first = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
      return first ?? data?.message ?? fallback
    }
    if (status === 429) return data?.message && data.message !== 'Too Many Attempts.' ? data.message : 'Too many tries. Wait a minute, then try again.'
    if (status === 404) return data?.message && data.message !== 'Not Found' ? data.message : 'That could not be found.'
    if (status === 401) return 'Your session ended. Log in again.'
    if (status === 413) return 'File is too big. Keep it at 5 MB or less.'
    if (status >= 500) return 'The server had a problem. Try again in a moment.'
    return data?.message ?? fallback
  }
  return fallback
}

export function isStatus(error: unknown, status: number): boolean {
  return isAxiosError(error) && error.response?.status === status
}
