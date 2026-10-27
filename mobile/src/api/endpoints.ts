import { File } from 'expo-file-system'

import { request } from './client'
import type {
  AppVersion,
  LiveSessionTicket,
  MediaItem,
  MediaKind,
  MobileSession,
  Scene,
  SetupDocument,
  SetupFull,
  SetupSummary,
  SoundRef,
  SubscriptionSummary,
  User,
} from './types'

type Wrapped<T> = { data: T }

export const authApi = {
  login: (body: { email: string; password: string; device_name: string }) =>
    request<Wrapped<MobileSession>>('/api/mobile/login', { method: 'POST', body, anonymous: true }).then((r) => r.data),
  register: (body: { name: string; email: string; password: string; password_confirmation: string; device_name: string }) =>
    request<Wrapped<MobileSession>>('/api/mobile/register', { method: 'POST', body, anonymous: true }).then((r) => r.data),
  me: () => request<Wrapped<User>>('/api/auth/me').then((r) => r.data),
  logout: () => request<void>('/api/mobile/logout', { method: 'POST' }),
  forgotPassword: (email: string) =>
    request<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: { email }, anonymous: true }).then((r) => r.message),
}

export const setupsApi = {
  list: () => request<Wrapped<SetupSummary[]>>('/api/setups').then((r) => r.data),
  get: (id: number) => request<Wrapped<SetupFull>>(`/api/setups/${id}`).then((r) => r.data),
  create: (body: { name?: string; from_setup_id?: number } = {}) =>
    request<Wrapped<SetupFull>>('/api/setups', { method: 'POST', body }).then((r) => r.data),
  save: (id: number, doc: SetupDocument) =>
    request<Wrapped<SetupFull>>(`/api/setups/${id}`, { method: 'PUT', body: doc }).then((r) => r.data),
}

export const liveApi = {
  /** Claims a "live at once" slot of the plan for this setup (409 when the plan has none left). */
  start: (setupId: number) =>
    request<Wrapped<LiveSessionTicket>>(`/api/setups/${setupId}/live-sessions`, { method: 'POST', body: { source: 'app' } }).then((r) => r.data),
  beat: (sessionId: string) => request<Wrapped<LiveSessionTicket>>(`/api/live-sessions/${sessionId}`, { method: 'PUT' }).then((r) => r.data),
  end: (sessionId: string) => request<void>(`/api/live-sessions/${sessionId}`, { method: 'DELETE' }),
  /** Keeps the setup's "on screen now" in step, so the website shows what the phone shows. */
  pushScene: (setupId: number, scene: Scene) => request<unknown>(`/api/setups/${setupId}/scene`, { method: 'PUT', body: scene }),
  /** Tells an open clean screen (website) to play a sound; the phone plays its own copy. */
  playSound: (setupId: number, sound: SoundRef, volume: number) =>
    request<unknown>(`/api/setups/${setupId}/sounds`, { method: 'POST', body: { sound, volume } }),
}

/** A picture picked on the phone, ready to upload. */
export interface PickedFile {
  uri: string
  name: string
  type: string
}

/** A FormData file part that Expo's fetch can send. */
export interface UploadPart {
  name: string
  type: string
  bytes: () => Promise<Uint8Array>
}

/**
 * Expo replaces the global fetch with expo/fetch, which builds the multipart body itself and
 * reads each file part through bytes(). React Native's { uri, name, type } part makes it throw
 * before anything is sent, which surfaced as "We couldn't reach the server".
 */
export function uploadPart(file: PickedFile): UploadPart {
  return { name: file.name, type: file.type, bytes: () => new File(file.uri).bytes() }
}

export const mediaApi = {
  list: () => request<Wrapped<MediaItem[]>>('/api/media').then((r) => r.data),
  upload: (kind: MediaKind, file: PickedFile) => {
    const body = new FormData()
    body.append('kind', kind)
    body.append('file', uploadPart(file) as unknown as Blob)
    // Up to 5 MB on slow mobile data.
    return request<Wrapped<MediaItem>>('/api/media', { method: 'POST', body, timeoutMs: 120_000 }).then((r) => r.data)
  },
  /** Setups using a deleted background go back to their built-in one; a foreground turns off. */
  remove: (id: number) => request<void>(`/api/media/${id}`, { method: 'DELETE' }),
}

export const accountApi = {
  subscription: () => request<Wrapped<SubscriptionSummary>>('/api/subscription').then((r) => r.data),
  version: () => request<Wrapped<AppVersion>>('/api/mobile/version', { anonymous: true }).then((r) => r.data),
  /** A link that opens `path` on the website already signed in; it works once, for a minute. */
  webLink: (path: string) => request<Wrapped<{ url: string }>>('/api/mobile/web-link', { method: 'POST', body: { path } }).then((r) => r.data),
}
