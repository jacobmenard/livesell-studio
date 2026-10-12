import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { http } from './api'

/**
 * WebSocket connection to Laravel Reverb. Returns null when live updates aren't
 * configured (VITE_REVERB_APP_KEY missing); callers then rely on polling.
 *
 * `authEndpoint` signs private channels: the session route for signed-in sellers, or
 * the token route for a private Browser Source link.
 */
export function createEcho(authEndpoint: string, extraAuthBody: Record<string, string> = {}): Echo<'reverb'> | null {
  const key = import.meta.env.VITE_REVERB_APP_KEY as string | undefined
  if (!key) return null

  const scheme = (import.meta.env.VITE_REVERB_SCHEME as string | undefined) ?? 'https'
  // Empty means "the host this page was opened on", so the app also works by LAN IP.
  const host = (import.meta.env.VITE_REVERB_HOST as string | undefined) || window.location.hostname
  const port = Number(import.meta.env.VITE_REVERB_PORT ?? (scheme === 'https' ? 443 : 80))

  return new Echo({
    broadcaster: 'reverb',
    key,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    Pusher,
    authorizer: (channel: { name: string }) => ({
      authorize: (socketId: string, callback: (error: Error | null, data: { auth: string } | null) => void) => {
        http
          .post<{ auth: string }>(authEndpoint, { socket_id: socketId, channel_name: channel.name, ...extraAuthBody })
          .then((response) => callback(null, response.data))
          .catch((error: Error) => callback(error, null))
      },
    }),
  })
}

export type ConnectionState = 'connecting' | 'connected' | 'unavailable'

/** Follows the socket's state so callers can fall back to polling while it's down. */
export function watchConnection(echo: Echo<'reverb'>, onChange: (state: ConnectionState) => void): () => void {
  const pusher = (echo.connector as unknown as { pusher: Pusher }).pusher
  const map = (state: string): ConnectionState =>
    state === 'connected' ? 'connected' : state === 'connecting' || state === 'initialized' ? 'connecting' : 'unavailable'
  const handler = ({ current }: { current: string }) => onChange(map(current))
  pusher.connection.bind('state_change', handler)
  onChange(map(pusher.connection.state))
  return () => pusher.connection.unbind('state_change', handler)
}
