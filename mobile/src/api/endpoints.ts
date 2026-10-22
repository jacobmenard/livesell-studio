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

export const mediaApi = {
  list: () => request<Wrapped<MediaItem[]>>('/api/media').then((r) => r.data),
  upload: (kind: MediaKind, file: PickedFile) => {
    const body = new FormData()
    body.append('kind', kind)
    // React Native's FormData takes { uri, name, type } for a file on the phone.
    body.append('file', file as unknown as Blob)
    return request<Wrapped<MediaItem>>('/api/media', { method: 'POST', body, timeoutMs: 60_000 }).then((r) => r.data)
  },
  remove: (id: number) => request<void>(`/api/media/${id}`, { method: 'DELETE' }),
}

export const accountApi = {
  subscription: () => request<Wrapped<SubscriptionSummary>>('/api/subscription').then((r) => r.data),
  version: () => request<Wrapped<AppVersion>>('/api/mobile/version', { anonymous: true }).then((r) => r.data),
}
