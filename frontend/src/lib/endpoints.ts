import { http } from './api'
import type {
  AdminAccount,
  AdminPayment,
  Destination,
  MediaItem,
  MediaKind,
  Orientation,
  OutputLinkState,
  Payment,
  PaymentMethod,
  PaymentMethodInput,
  PaymentStatus,
  Plan,
  Platform,
  Resolution,
  Scene,
  SetupDocument,
  SetupFull,
  SetupSummary,
  SoundRef,
  SubscriptionSummary,
  TeamState,
  ThemePref,
  TourName,
  User,
} from './types'

type Wrapped<T> = { data: T }

export const authApi = {
  me: () => http.get<Wrapped<User>>('/api/auth/me').then((r) => r.data.data),
  login: (body: { email: string; password: string; remember: boolean }) =>
    http.post<Wrapped<User>>('/api/auth/login', body).then((r) => r.data.data),
  register: (body: { name: string; email: string; password: string; password_confirmation: string }) =>
    http.post<Wrapped<User>>('/api/auth/register', body).then((r) => r.data.data),
  logout: () => http.post('/api/auth/logout'),
  /** Swaps the Android app's one-time code (lib/handoff.ts) for a signed-in session. */
  handoff: (code: string) => http.post<Wrapped<User>>('/api/auth/handoff', { code }).then((r) => r.data.data),
  forgotPassword: (email: string) =>
    http.post<{ message: string }>('/api/auth/forgot-password', { email }).then((r) => r.data.message),
  resetPassword: (body: { token: string; email: string; password: string; password_confirmation: string }) =>
    http.post<{ message: string }>('/api/auth/reset-password', body).then((r) => r.data.message),
  saveTheme: (theme: ThemePref) =>
    http.patch<Wrapped<User>>('/api/me/preferences', { theme }).then((r) => r.data.data),
  completeTour: (tour: TourName) => http.put<Wrapped<User>>(`/api/me/tours/${tour}`).then((r) => r.data.data),
  /** The superadmin, signed in as an owner, goes back to their own account. */
  stopImpersonating: () => http.post<Wrapped<User>>('/api/auth/impersonation/stop').then((r) => r.data.data),
}

export const setupsApi = {
  list: () => http.get<Wrapped<SetupSummary[]>>('/api/setups').then((r) => r.data.data),
  get: (id: number) => http.get<Wrapped<SetupFull>>(`/api/setups/${id}`).then((r) => r.data.data),
  create: (body: { name?: string; from_setup_id?: number } = {}) =>
    http.post<Wrapped<SetupFull>>('/api/setups', body).then((r) => r.data.data),
  save: (id: number, doc: SetupDocument) =>
    http.put<Wrapped<SetupFull>>(`/api/setups/${id}`, doc).then((r) => r.data.data),
  duplicate: (id: number) =>
    http.post<Wrapped<SetupFull>>(`/api/setups/${id}/duplicate`).then((r) => r.data.data),
  remove: (id: number) => http.delete(`/api/setups/${id}`),
}

export const liveApi = {
  scene: (setupId: number) => http.get<Wrapped<Scene>>(`/api/setups/${setupId}/scene`).then((r) => r.data.data),
  pushScene: (setupId: number, scene: Scene) =>
    http
      .put<Wrapped<Scene> & { meta: { delivered: boolean } }>(`/api/setups/${setupId}/scene`, scene)
      .then((r) => r.data.meta.delivered),
  playSound: (setupId: number, sound: SoundRef, volume: number) =>
    http
      .post<{ meta: { delivered: boolean } }>(`/api/setups/${setupId}/sounds`, { sound, volume })
      .then((r) => r.data.meta.delivered),
  outputLink: (setupId: number) =>
    http.get<Wrapped<OutputLinkState>>(`/api/setups/${setupId}/output-link`).then((r) => r.data.data),
  newOutputLink: (setupId: number) =>
    http.post<Wrapped<OutputLinkState>>(`/api/setups/${setupId}/output-link`).then((r) => r.data.data),
  turnOffOutputLink: (setupId: number) => http.delete(`/api/setups/${setupId}/output-link`),
}

export const outputApi = {
  show: (token: string) =>
    http
      .get<Wrapped<{ channel: string; scene: Scene }>>(`/api/output/${encodeURIComponent(token)}`)
      .then((r) => r.data.data),
}

export const mediaApi = {
  list: () => http.get<Wrapped<MediaItem[]>>('/api/media').then((r) => r.data.data),
  upload: (kind: MediaKind, file: File) => {
    const body = new FormData()
    body.append('kind', kind)
    body.append('file', file)
    return http.post<Wrapped<MediaItem>>('/api/media', body, { timeout: 60_000 }).then((r) => r.data.data)
  },
  remove: (id: number) => http.delete(`/api/media/${id}`),
}

export const destinationsApi = {
  list: () => http.get<Wrapped<Destination[]>>('/api/destinations').then((r) => r.data.data),
  save: (platform: Platform, body: { server_url: string; stream_key: string }) =>
    http.put<Wrapped<Destination>>(`/api/destinations/${platform}`, body).then((r) => r.data.data),
  remove: (platform: Platform) => http.delete(`/api/destinations/${platform}`),
}

export const broadcastApi = {
  /** A one-time ticket for the local relay. The stream key itself never comes to the browser. */
  start: (setupId: number, body: { platform: Platform; orientation: Orientation; resolution: Resolution }) =>
    http.post<Wrapped<{ ticket: string }>>(`/api/setups/${setupId}/broadcasts`, body).then((r) => r.data.data.ticket),
}

export const subscriptionApi = {
  show: () => http.get<Wrapped<SubscriptionSummary>>('/api/subscription').then((r) => r.data.data),
}

/** Paying for a plan: GCash → bank transfer, then the reference number and receipt (owner only). */
export const paymentsApi = {
  submit: (body: { plan: string; payment_method: number; reference_number: string; proof: File }) => {
    const form = new FormData()
    form.append('plan', body.plan)
    form.append('payment_method', String(body.payment_method))
    form.append('reference_number', body.reference_number)
    form.append('proof', body.proof)
    return http.post<Wrapped<Payment>>('/api/payments', form).then((r) => r.data.data)
  },
  /** The receipt screenshot, fetched with the session (it is never a public URL). */
  proof: (paymentId: number) => http.get<Blob>(`/api/payments/${paymentId}/proof`, { responseType: 'blob' }).then((r) => r.data),
}

export const teamApi = {
  show: () => http.get<Wrapped<TeamState>>('/api/team').then((r) => r.data.data),
  add: (body: { name: string; email: string; password: string }) => http.post<Wrapped<TeamState>>('/api/team', body).then((r) => r.data.data),
  remove: (memberId: number) => http.delete(`/api/team/${memberId}`),
}

export const adminApi = {
  accounts: (params: { search: string; page: number }) =>
    http
      .get<{ data: AdminAccount[]; meta: { current_page: number; last_page: number; total: number } }>('/api/admin/accounts', { params })
      .then((r) => r.data),
  /** Signs the superadmin in as this account owner. */
  impersonate: (accountId: number) => http.post<Wrapped<User>>(`/api/admin/accounts/${accountId}/impersonate`).then((r) => r.data.data),
  plans: () => http.get<Wrapped<Plan[]>>('/api/admin/plans').then((r) => r.data.data),
  updatePlan: (planId: number, body: Pick<Plan, 'name' | 'price_monthly' | 'max_subusers' | 'max_live_setups'>) =>
    http.put<Wrapped<Plan>>(`/api/admin/plans/${planId}`, body).then((r) => r.data.data),
  payments: (params: { status: PaymentStatus | 'all'; search: string; page: number }) =>
    http
      .get<{ data: AdminPayment[]; meta: { current_page: number; last_page: number; total: number } }>('/api/admin/payments', { params })
      .then((r) => r.data),
  pendingPayments: () => http.get<Wrapped<{ pending: number }>>('/api/admin/payments/pending-count').then((r) => r.data.data.pending),
  approvePayment: (paymentId: number) =>
    http.post<Wrapped<AdminPayment>>(`/api/admin/payments/${paymentId}/approve`).then((r) => r.data.data),
  paymentMethods: () => http.get<Wrapped<PaymentMethod[]>>('/api/admin/payment-methods').then((r) => r.data.data),
  createPaymentMethod: (body: PaymentMethodInput) => http.post<Wrapped<PaymentMethod>>('/api/admin/payment-methods', body).then((r) => r.data.data),
  updatePaymentMethod: (id: number, body: PaymentMethodInput) =>
    http.put<Wrapped<PaymentMethod>>(`/api/admin/payment-methods/${id}`, body).then((r) => r.data.data),
  deletePaymentMethod: (id: number) => http.delete(`/api/admin/payment-methods/${id}`),
  rejectPayment: (paymentId: number, reason: string) =>
    http.post<Wrapped<AdminPayment>>(`/api/admin/payments/${paymentId}/reject`, { reason }).then((r) => r.data.data),
}

export interface LiveSessionHandle {
  id: string
  heartbeat_seconds: number
}

/**
 * An open clean screen reports in, so the plan's limit on setups live at once holds. The
 * seller's own window uses the session; a Browser Source link uses its token.
 */
export const liveSessionApi = {
  start: (where: LiveSessionTarget) => http.post<Wrapped<LiveSessionHandle>>(liveSessionBase(where), {}).then((r) => r.data.data),
  beat: (where: LiveSessionTarget, id: string) => http.put<Wrapped<LiveSessionHandle>>(`${liveSessionBase(where, true)}/${id}`, {}).then((r) => r.data.data),
  end: (where: LiveSessionTarget, id: string) => http.delete(`${liveSessionBase(where, true)}/${id}`),
}

export type LiveSessionTarget = { setupId: number } | { token: string }

function liveSessionBase(where: LiveSessionTarget, existing = false): string {
  if ('token' in where) return `/api/output/${encodeURIComponent(where.token)}/live-sessions`
  return existing ? '/api/live-sessions' : `/api/setups/${where.setupId}/live-sessions`
}

/** Full URL of one live session, for ending it with fetch(…, { keepalive }) as the page closes. */
export function liveSessionUrl(where: LiveSessionTarget, id: string): string {
  return `${import.meta.env.VITE_API_URL ?? ''}${liveSessionBase(where, true)}/${id}`
}

/** The plans and prices, without logging in (pricing page). */
export const plansApi = {
  list: () => http.get<Wrapped<Plan[]>>('/api/plans').then((r) => r.data.data),
}
