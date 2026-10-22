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
  /**
   * prepare / camera / sound as before; "microphone" = the mic couldn't start when going live;
   * "segmentation" = this phone can't find the person, so Blur and Picture backgrounds aren't drawn;
   * "zoom" = this camera can't zoom out as far as asked (the message says how far it goes).
   */
  code: 'prepare' | 'camera' | 'sound' | 'microphone' | 'segmentation' | string
  message: string
}

export interface LiveStreamerProps extends ViewProps {
  orientation: 'portrait' | 'landscape'
  resolution: '720p' | '1080p'
  facing: 'front' | 'back'
  /**
   * Tablets (the app turns with the device): turn the camera with the screen, and fill the live
   * with the middle of the picture when the tablet is held across the live's shape. Phones
   * leave it off: they stay upright and are held the way the live is shaped.
   */
  followRotation?: boolean
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
  /** JSON NativeLook (src/stage/stageLook.ts): camera look, colour filter, background, foreground. */
  setLook(json: string): Promise<void>
}
