import type { NativeSyntheticEvent, ViewProps } from 'react-native'

/** previewing → connecting → live ⇄ reconnecting → stopped | failed */
export type LiveStatus = 'previewing' | 'connecting' | 'live' | 'reconnecting' | 'stopped' | 'failed'

export interface LiveStatusEvent {
  status: LiveStatus
  /** Why it failed or is retrying (from the RTMP client), or "auth" for a rejected stream key. */
  reason?: string
  /** Retries so far in this drop (0 when connected). */
  attempt: number
  maxAttempts: number
  retryDelayMs: number
}

export interface LiveStatsEvent {
  bitrateKbps: number
  queueKB: number
  /** How full the send queue is, 0–100. High = the internet can't keep up. */
  congestion: number
  throughput: 'unknown' | 'low' | 'medium' | 'high' | string
}

export interface LiveErrorEvent {
  code: 'prepare' | 'camera' | 'sound' | string
  message: string
}

export interface LiveStreamerProps extends ViewProps {
  orientation: 'portrait' | 'landscape'
  resolution: '720p' | '1080p'
  facing: 'front' | 'back'
  onStatus?: (event: NativeSyntheticEvent<LiveStatusEvent>) => void
  onStats?: (event: NativeSyntheticEvent<LiveStatsEvent>) => void
  onError?: (event: NativeSyntheticEvent<LiveErrorEvent>) => void
}

/** Controls on the native view (all run on the main thread). */
export interface LiveStreamerHandle {
  startStream(url: string): Promise<void>
  stopStream(): Promise<void>
  /** Drop a pending retry and connect again now. */
  restartStream(): Promise<void>
  switchCamera(): Promise<void>
  setMicMuted(muted: boolean): Promise<void>
  /** JSON array of PopupDrawSpec (src/stage/look.ts), bottom to top. */
  setOverlay(json: string): Promise<void>
  playSound(id: string, volume: number, toStream: boolean, monitor: boolean): Promise<void>
}
