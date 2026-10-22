import { useIsFocused } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'

import type { Orientation, Resolution } from '@/api/types'
import { Icon } from '@/components/Icon'
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
}: {
  width: number
  height: number
  orientation: Orientation
  resolution: Resolution
  look: NativeLook
  overlay: PopupDrawSpec[]
  onSegmentationMissing: () => void
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
            else if (code === 'camera' || code === 'prepare') setCameraError(message)
          }}
        />
      ) : (
        <StandIn look={look} overlay={overlay} width={width} height={height} />
      )}

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
          <Image source={picture} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
          <StagePerson />
        </>
      ) : (
        <StageBackdrop />
      )}
      {bg.mode === 'blur' && <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30,30,36,0.35)' }]} />}
      {fg && <Image source={{ uri: fg.url }} style={[styles.foreground, fg.dock === 'top' ? { top: 0 } : { bottom: 0 }, { height: width / 3 }]} resizeMode="contain" accessible={false} />}
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
