import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Orientation, Platform } from '../lib/types'
import { broadcastChannelName, isBroadcasting, startBroadcast, type BroadcastMessage, type BroadcastStatus, type BroadcastTarget } from './broadcast'
import { PLATFORMS } from './catalog'

const IDLE: BroadcastStatus = { state: 'idle', message: '' }

export const platformLabel = (platform: Platform) => PLATFORMS.find((p) => p.id === platform)?.label ?? 'your platform'

/**
 * The clean-screen side of streaming straight to a platform: runs the live, tells the
 * editor how it's going, and stops when the editor asks.
 */
export function useBroadcast(target: BroadcastTarget | undefined, orientation: Orientation | null, stageRef: RefObject<HTMLElement | null>) {
  const [status, setStatus] = useState<BroadcastStatus>(IDLE)
  const statusRef = useRef(status)
  const stopRef = useRef<(() => void) | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const setupId = target?.setupId
  const platform = target?.platform

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    if (setupId === undefined || platform === undefined) return
    const channel = new BroadcastChannel(broadcastChannelName(setupId))
    channelRef.current = channel
    channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      if (event.data?.type === 'stop') stopRef.current?.()
      if (event.data?.type === 'ask') channel.postMessage({ type: 'status', platform, status: statusRef.current } satisfies BroadcastMessage)
    }
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [setupId, platform])

  useEffect(() => {
    if (platform === undefined) return
    channelRef.current?.postMessage({ type: 'status', platform, status } satisfies BroadcastMessage)
    // The window title is the one place the seller can see it's live without it showing on the live.
    document.title = status.state === 'live' ? `● LIVE on ${platformLabel(platform)} — NegosyoWork Studio` : 'NegosyoWork Studio — Clean screen'
  }, [platform, status])

  // Closing this window mid-live would end it: ask first.
  useEffect(() => {
    if (!isBroadcasting(status.state)) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status.state])

  useEffect(() => () => stopRef.current?.(), [])

  /** `mic` is the camera's sound, mixed straight into the live (see BroadcastOptions). */
  const start = useCallback(
    (mic: MediaStream | null) => {
      const stage = stageRef.current
      if (!target || !orientation || !stage || isBroadcasting(statusRef.current.state)) return
      stopRef.current = startBroadcast({ ...target, orientation, stage, mic, onStatus: setStatus })
    },
    [orientation, stageRef, target],
  )

  return { status, start }
}

/** The editor side: follows a live running in the clean-screen window, and can stop it. */
export function useBroadcastWatch(setupId: number) {
  const [live, setLive] = useState<{ platform: Platform; status: BroadcastStatus } | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    const channel = new BroadcastChannel(broadcastChannelName(setupId))
    channelRef.current = channel
    channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      if (event.data?.type === 'status') setLive({ platform: event.data.platform, status: event.data.status })
    }
    // A clean screen that's already streaming answers with where it stands.
    channel.postMessage({ type: 'ask' } satisfies BroadcastMessage)
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [setupId])

  const stop = useCallback(() => channelRef.current?.postMessage({ type: 'stop' } satisfies BroadcastMessage), [])

  return { live, stop }
}
