import { API_URL, REQUEST_TIMEOUT_MS } from '@/config'

/**
 * One way to call the Laravel API: JSON in and out, the bearer token from secure storage,
 * a timeout, and Laravel's errors turned into plain messages a seller can act on.
 */

export class ApiError extends Error {
  /** 0 = the request never reached the server (offline, timeout, DNS). */
  readonly status: number
  /** Laravel's 422 errors: field → first message. */
  readonly fields: Record<string, string>
  /** Extra keys from the error body, e.g. `preview` on a 409 from live-sessions. */
  readonly body: Record<string, unknown>

  constructor(message: string, status: number, fields: Record<string, string> = {}, body: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
    this.body = body
  }

  get offline(): boolean {
    return this.status === 0
  }
}

type TokenGetter = () => string | null
type UnauthorizedHandler = () => void

let getToken: TokenGetter = () => null
let onUnauthorized: UnauthorizedHandler = () => {}

/** Wired by AuthProvider: where the token comes from, and what a 401 does (sign the phone out). */
export function configureApi(options: { getToken: TokenGetter; onUnauthorized: UnauthorizedHandler }): void {
  getToken = options.getToken
  onUnauthorized = options.onUnauthorized
}

const OFFLINE = "We couldn't reach the server. Check your internet and try again."

function firstFieldErrors(errors: unknown): Record<string, string> {
  if (!errors || typeof errors !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [field, messages] of Object.entries(errors as Record<string, unknown>)) {
    if (Array.isArray(messages) && typeof messages[0] === 'string') out[field] = messages[0]
  }
  return out
}

/** A short message for a failed response (mirrors frontend/src/lib/api.ts). */
export function messageFor(status: number, body: Record<string, unknown>): string {
  const message = typeof body.message === 'string' ? body.message : undefined
  const fields = firstFieldErrors(body.errors)
  if (status === 422) return Object.values(fields)[0] ?? message ?? 'Check the highlighted fields.'
  if (status === 429) return message && message !== 'Too Many Attempts.' ? message : 'Too many tries. Wait a minute, then try again.'
  if (status === 401) return 'Your session ended. Log in again.'
  if (status === 403) return message && message !== 'This action is unauthorized.' ? message : "You don't have access to that."
  if (status === 404) return message && message !== 'Not Found' ? message : 'That could not be found.'
  if (status >= 500) return 'The server had a problem. Try again in a moment.'
  return message ?? 'Something went wrong. Try again.'
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Skip the bearer token (login, register, version check). */
  anonymous?: boolean
  signal?: AbortSignal
  /** Longer for uploads; the default suits ordinary requests. */
  timeoutMs?: number
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS)
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort)

  // A FormData body (an upload) sets its own multipart Content-Type with the boundary.
  const multipart = options.body instanceof FormData
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined && !multipart) headers['Content-Type'] = 'application/json'
  const token = options.anonymous ? null : getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : multipart ? (options.body as FormData) : JSON.stringify(options.body),
      signal: controller.signal,
    })
  } catch {
    throw new ApiError(OFFLINE, 0)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }

  if (response.status === 204) return undefined as T

  let body: Record<string, unknown> = {}
  try {
    const text = await response.text()
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    // A proxy error page or a cut-off response: fall back to the status message below.
  }

  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized()
    throw new ApiError(messageFor(response.status, body), response.status, firstFieldErrors(body.errors), body)
  }

  return body as T
}

/** A short message for anything a request can throw. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (error instanceof ApiError) return error.message
  return fallback
}
