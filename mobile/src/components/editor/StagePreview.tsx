import { useIsFocused } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native'

import type { Orientation, Resolution } from '@/api/types'
import { Icon } from '@/components/Icon'
import { Picture } from '@/components/Picture'
import { PopupLayer } from '@/components/PopupArt'
import { StageBackdrop, StagePerson } from '@/components/StageBackdrop'
import { IconButton } from '@/components/ui'
import { checkPermissions, openAppSettings, requestCamera, type PermissionState } from '@/live/permissions'
import { BACKGROUND_PRESETS } from '@/stage/backgrounds'
import type { PopupDrawSpec } from '@/stage/look'
import type { NativeLook } from '@/stage/stageLook'
import { colors, radius, space } from '@/theme'
import { LiveStreamerView, type LiveStreamerHandle } from '../../../modules/live-streamer'

/**
 * The editor's preview. With the camera allowed it is the real camera, drawn by the same
 * native code as the live (so the look, filter, background and foreground are exactly what
 * viewers get). Otherwise, or with the camera off, a stand-in picture built from the setup.
 *
 * The camera only runs while this screen is in front: the live screen needs it next.
 */
export function StagePreview({
  width,
  height,
  orientation,
  resolution,
  look,
  overlay,
  onSegmentationMissing,
  onZoomLimit,
  popupGestures,
}: {
  width: number
  height: number
  orientation: Orientation
  resolution: Resolution
  look: NativeLook
  overlay: PopupDrawSpec[]
  onSegmentationMissing: () => void
  /** The camera can't zoom out as far as the setup asks (the message says how far it goes). */
  onZoomLimit: (message: string) => void
  /** Moving and resizing the selected popup by touch (the Popups step). */
  popupGestures?: PopupGestureHandlers
}) {
  const focused = useIsFocused()
  const streamer = useRef<LiveStreamerHandle>(null)
  const [permission, setPermission] = useState<PermissionState | 'checking'>('checking')
  const [cameraOn, setCameraOn] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  /** Counts "previewing" events, so a camera that restarts gets the look again. */
  const [previews, setPreviews] = useState(0)
  const [facing, setFacing] = useState<'front' | 'back'>('front')

  useEffect(() => {
    let alive = true
    void checkPermissions().then((p) => alive && setPermission(p.camera))
    return () => {
      alive = false
    }
  }, [])

  const showCamera = permission === 'granted' && cameraOn && focused && !cameraError
  const lookJson = JSON.stringify(look)
  const overlayJson = JSON.stringify(overlay)

  // Sent again once the camera is running (the native view starts with the plain picture).
  useEffect(() => {
    if (previews > 0) void streamer.current?.setLook(lookJson).catch(() => {})
  }, [lookJson, previews])

  useEffect(() => {
    if (previews > 0) void streamer.current?.setOverlay(overlayJson).catch(() => {})
  }, [overlayJson, previews])

  const askCamera = async () => {
    if (permission === 'blocked') return openAppSettings()
    const result = await requestCamera()
    setPermission(result)
    setCameraOn(true)
    setCameraError(null)
  }

  return (
    <View style={{ width, height, borderRadius: 4, overflow: 'hidden', backgroundColor: '#000' }}>
      {showCamera ? (
        <LiveStreamerView
          ref={streamer}
          style={StyleSheet.absoluteFill}
          orientation={orientation}
          resolution={resolution}
          facing={facing}
          onStatus={(e) => e.nativeEvent.status === 'previewing' && setPreviews((n) => n + 1)}
          onError={(e) => {
            const { code, message } = e.nativeEvent
            if (code === 'segmentation') onSegmentationMissing()
            else if (code === 'zoom') onZoomLimit(message)
            else if (code === 'camera' || code === 'prepare') setCameraError(message)
          }}
        />
      ) : (
        <StandIn look={look} overlay={overlay} width={width} height={height} />
      )}

      {popupGestures && <PopupGestures width={width} height={height} handlers={popupGestures} />}

      {showCamera && (
        <View style={styles.tools}>
          <IconButton icon="flip" label="Flip camera" tone="overlay" size={44} onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))} />
          <IconButton icon="eyeOff" label="Turn the camera preview off" tone="overlay" size={44} onPress={() => setCameraOn(false)} />
        </View>
      )}

      {!showCamera && permission !== 'checking' && focused && (
        <Pressable
          onPress={() => (permission === 'granted' && !cameraError ? setCameraOn(true) : void askCamera())}
          accessibilityRole="button"
          style={styles.cameraButton}
          accessibilityHint="Shows your real camera with this look"
        >
          <Icon name="user" size={16} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
            {cameraError ? 'Try camera again' : permission === 'blocked' ? 'Allow camera in Settings' : 'Show my camera'}
          </Text>
        </Pressable>
      )}
      {cameraError && !showCamera && (
        <View style={styles.error}>
          <Text style={{ color: colors.warning, fontSize: 12, textAlign: 'center' }} numberOfLines={3}>
            {cameraError}
          </Text>
        </View>
      )}
    </View>
  )
}

export interface PopupGestureHandlers {
  /** The popup's centre goes here (% of the stage width and height). */
  onPlace: (x: number, y: number) => void
  /** Two fingers: `ratio` = their distance now ÷ when the pinch began. */
  onPinch: (phase: 'start' | 'move' | 'end', ratio: number) => void
  /** A finger is down (the editor stops scrolling meanwhile). */
  onActive: (active: boolean) => void
}

const clampPercent = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100

function fingerGap(e: GestureResponderEvent): number | null {
  const [a, b] = e.nativeEvent.touches
  return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : null
}

/**
 * Over the whole preview: one finger puts the selected popup's centre where it touches and
 * drags it along; two fingers pinch it bigger or smaller. Updates are sent at most once per
 * frame, so the native preview isn't asked to redraw faster than the screen does.
 */
function PopupGestures({ width, height, handlers }: { width: number; height: number; handlers: PopupGestureHandlers }) {
  // This touch's state (changes on every move, so not React state).
  const touch = useRef<{ pinchFrom: number | null; pinched: boolean; frame: number | null; pending: (() => void) | null }>({
    pinchFrom: null,
    // After a pinch, the finger left behind doesn't move the popup (it would jump to it).
    pinched: false,
    frame: null,
    pending: null,
  })

  useEffect(() => {
    const t = touch.current
    return () => {
      if (t.frame !== null) cancelAnimationFrame(t.frame)
    }
  }, [])

  const nextFrame = (run: () => void) => {
    const t = touch.current
    t.pending = run
    t.frame ??= requestAnimationFrame(() => {
      t.frame = null
      t.pending?.()
      t.pending = null
    })
  }

  const follow = (e: GestureResponderEvent) => {
    const t = touch.current
    const gap = fingerGap(e)
    if (gap !== null && gap > 0) {
      if (t.pinchFrom === null) {
        t.pinchFrom = gap
        t.pinched = true
        handlers.onPinch('start', 1)
      } else {
        const ratio = gap / t.pinchFrom
        nextFrame(() => handlers.onPinch('move', ratio))
      }
      return
    }
    if (t.pinched) return
    const x = clampPercent((e.nativeEvent.locationX / width) * 100)
    const y = clampPercent((e.nativeEvent.locationY / height) * 100)
    nextFrame(() => handlers.onPlace(x, y))
  }

  const finish = () => {
    const t = touch.current
    if (t.frame !== null) cancelAnimationFrame(t.frame)
    t.frame = null
    t.pending?.()
    t.pending = null
    if (t.pinchFrom !== null) handlers.onPinch('end', 1)
    t.pinchFrom = null
    t.pinched = false
    handlers.onActive(false)
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        handlers.onActive(true)
        follow(e)
        // True keeps the page's scroll view from taking over the drag.
        return true
      }}
      onResponderMove={follow}
      onResponderRelease={finish}
      onResponderTerminate={finish}
      accessibilityLabel="Popup position"
      accessibilityHint="Drag to move the selected popup. Pinch with two fingers to resize it."
    />
  )
}

/** A stand-in for the camera: the background as set, a person, the foreground and the popup. */
function StandIn({ look, overlay, width, height }: { look: NativeLook; overlay: PopupDrawSpec[]; width: number; height: number }) {
  const bg = look.background
  const picture = bg.mode === 'image' || bg.mode === 'green' ? (bg.imageUrl ? { uri: bg.imageUrl } : BACKGROUND_PRESETS.find((p) => p.id === bg.preset)?.thumb) : undefined
  const fg = look.foreground
  return (
    <View style={StyleSheet.absoluteFill}>
      {picture ? (
        <>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: bg.tone }]} />
          <Picture source={picture} style={StyleSheet.absoluteFill} accessible={false} />
          <StagePerson />
        </>
      ) : (
        <StageBackdrop />
      )}
      {bg.mode === 'blur' && <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30,30,36,0.35)' }]} />}
      {fg && <Picture source={{ uri: fg.url }} style={[styles.foreground, fg.dock === 'top' ? { top: 0 } : { bottom: 0 }, { height: width / 3 }]} fit="contain" accessible={false} />}
      <PopupLayer specs={overlay} width={width} height={height} />
    </View>
  )
}

const styles = StyleSheet.create({
  // Bottom right: popups sit at the top right by default, and a top foreground at the top.
  tools: { position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', gap: 6 },
  cameraButton: {
    position: 'absolute',
    bottom: space.sm,
    alignSelf: 'center',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  error: { position: 'absolute', top: space.sm, left: space.sm, right: space.sm, padding: 6, borderRadius: radius.sm, backgroundColor: colors.warningBg },
  foreground: { position: 'absolute', left: 0, right: 0, width: '100%' },
})
