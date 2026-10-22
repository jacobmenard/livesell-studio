import * as Battery from 'expo-battery'
import { useKeepAwake } from 'expo-keep-awake'
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { liveApi } from '@/api/endpoints'
import type { BackgroundMode, BuiltinSoundId, CameraFilterId, Platform, PopupConfig, Resolution } from '@/api/types'
import { Icon } from '@/components/Icon'
import { PopupArt } from '@/components/PopupArt'
import { Button, ErrorState, IconButton, Loading, Notice, Segmented, Sheet } from '@/components/ui'
import { isBuiltinSound, PLATFORM_BY_ID, SOUNDS } from '@/catalog'
import { useMedia, useSetup } from '@/hooks/queries'
import { clock, failureMessage, signal } from '@/live/format'
import { useLiveSession } from '@/live/useLiveSession'
import { popupText, resolveLook } from '@/stage/look'
import { BACKGROUND_MODES } from '@/stage/backgrounds'
import { CAMERA_FILTERS } from '@/stage/filters'
import { overlayFor, sceneFor, togglePopup, hidePopup, type ActivePopup, type LiveOverrides } from '@/stage/scene'
import { backgroundWithDefaults, cameraWithDefaults, nativeLook } from '@/stage/stageLook'
import { loadDestination, streamUrl, type StreamDestination } from '@/stream/streamKeys'
import { colors, radius, space } from '@/theme'
import { LiveStreamerView, type LiveStatsEvent, type LiveStatusEvent, type LiveStreamerHandle } from '../../../modules/live-streamer'

const VOLUMES = [
  { id: '40', label: 'Soft' },
  { id: '70', label: 'Medium' },
  { id: '100', label: 'Loud' },
] as const

export default function LiveScreen() {
  const params = useLocalSearchParams<{ id: string; platform: Platform; quality: Resolution; facing: 'front' | 'back' }>()
  const setupId = Number(params.id)
  const platform: Platform = params.platform in PLATFORM_BY_ID ? params.platform : 'facebook'
  const platformLabel = PLATFORM_BY_ID[platform].label
  const setup = useSetup(setupId)
  const session = useLiveSession(setupId)
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const batteryLevel = Battery.useBatteryLevel()
  useKeepAwake()

  const streamer = useRef<LiveStreamerHandle>(null)
  const [destination, setDestination] = useState<StreamDestination | null | undefined>(undefined)
  const [status, setStatus] = useState<LiveStatusEvent | null>(null)
  const [stats, setStats] = useState<LiveStatsEvent | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [micError, setMicError] = useState<string | null>(null)
  const [segmentationMissing, setSegmentationMissing] = useState(false)
  const [lookOpen, setLookOpen] = useState(false)
  /** Background and filter changed during this live (not saved to the setup). */
  const [overrides, setOverrides] = useState<LiveOverrides>({})
  const media = useMedia()
  const [active, setActive] = useState<ActivePopup[]>([])
  const [micMuted, setMicMuted] = useState(false)
  const [soundsOpen, setSoundsOpen] = useState(false)
  const [volume, setVolume] = useState<number | null>(null)
  const [toStream, setToStream] = useState<boolean | null>(null)
  const [liveSince, setLiveSince] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [ending, setEnding] = useState(false)
  const [leftApp, setLeftApp] = useState(false)
  const started = useRef(false)
  const counts = useRef({ popups: 0, sounds: 0, drops: 0 })
  const hideTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const popups: PopupConfig[] = useMemo(() => setup.data?.popups ?? [], [setup.data])
  const soundVolume = volume ?? setup.data?.sound_settings.volume ?? 80
  const soundToStream = toStream ?? setup.data?.sound_settings.to_stream ?? true
  const monitor = setup.data?.sound_settings.monitor ?? false

  // 1. The stream key from this phone's secure storage.
  useEffect(() => {
    void loadDestination(platform).then(setDestination)
  }, [platform])

  // 2. Claim the plan's live slot before streaming (a plan without room says so here).
  useEffect(() => {
    if (setup.data && session.state.kind === 'idle') void session.claim()
  }, [setup.data, session])

  // 3. Once the camera is running and the slot is ours, connect to the platform.
  useEffect(() => {
    if (started.current || !destination || session.state.kind !== 'held' || status?.status !== 'previewing') return
    started.current = true
    void streamer.current?.startStream(streamUrl(destination))
  }, [destination, session.state.kind, status?.status])

  // The popups showing, drawn into the video by the native streamer.
  useEffect(() => {
    void streamer.current?.setOverlay(JSON.stringify(overlayFor(popups, active)))
  }, [popups, active, status?.status])

  // The camera look, background and foreground, drawn into the video by the native streamer.
  const lookJson = useMemo(() => {
    if (!setup.data) return null
    const d = setup.data
    return JSON.stringify(
      nativeLook({ camera: { ...d.camera, ...overrides.camera }, background: { ...d.background, ...overrides.background }, foreground: d.foreground }, media.data ?? []),
    )
  }, [setup.data, overrides, media.data])

  useEffect(() => {
    if (lookJson) void streamer.current?.setLook(lookJson).catch(() => {})
  }, [lookJson, status?.status])

  // Keep the website's copy of "on screen now" in step (best effort, never blocks the live).
  const mediaIds = useMemo(() => (media.data ? new Set(media.data.map((m) => m.id)) : undefined), [media.data])
  useEffect(() => {
    if (!setup.data) return
    const data = setup.data
    const timer = setTimeout(() => void liveApi.pushScene(setupId, sceneFor(data, active, overrides, mediaIds)).catch(() => {}), 500)
    return () => clearTimeout(timer)
  }, [active, setup.data, setupId, overrides, mediaIds])

  // The live timer.
  useEffect(() => {
    if (!liveSince) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [liveSince])

  // Android stops the camera when the app is left; tell the seller when they come back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' && liveSince) setLeftApp(true)
    })
    return () => sub.remove()
  }, [liveSince])

  useEffect(() => {
    const timers = hideTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])

  const onStatus = useCallback((event: LiveStatusEvent) => {
    setStatus((previous) => {
      if (event.status === 'reconnecting' && previous?.status === 'live') counts.current.drops += 1
      return event
    })
    if (event.status === 'live') setLiveSince((since) => since ?? Date.now())
  }, [])

  const play = (sound: BuiltinSoundId) => {
    counts.current.sounds += 1
    void streamer.current?.playSound(sound, soundVolume, soundToStream, monitor)
  }

  const tapPopup = (popup: PopupConfig) => {
    const showing = active.some((a) => a.key === popup.key)
    setActive((current) => togglePopup(current, popup.key, Date.now()))
    const timers = hideTimers.current
    const pending = timers.get(popup.key)
    if (pending) clearTimeout(pending)
    timers.delete(popup.key)
    if (showing) return

    counts.current.popups += 1
    if (isBuiltinSound(popup.sound)) play(popup.sound)
    if (popup.auto_hide > 0) {
      timers.set(
        popup.key,
        setTimeout(() => {
          setActive((current) => hidePopup(current, popup.key))
          timers.delete(popup.key)
        }, popup.auto_hide * 1000),
      )
    }
  }

  const hideAll = () => {
    hideTimers.current.forEach(clearTimeout)
    hideTimers.current.clear()
    setActive([])
  }

  const finish = useCallback(async () => {
    setEnding(true)
    await streamer.current?.stopStream().catch(() => {})
    await session.release()
    const seconds = liveSince ? Math.round((Date.now() - liveSince) / 1000) : 0
    router.replace({
      pathname: '/live/ended',
      params: {
        name: setup.data?.name ?? '',
        platform,
        seconds: String(seconds),
        popups: String(counts.current.popups),
        sounds: String(counts.current.sounds),
        drops: String(counts.current.drops),
        setupId: String(setupId),
      },
    })
  }, [liveSince, platform, session, setup.data?.name, setupId])

  /** Leaves without a summary (the live never started). */
  const leave = useCallback(async () => {
    setEnding(true)
    await streamer.current?.stopStream().catch(() => {})
    await session.release()
    router.back()
  }, [session])

  const confirmEnd = useCallback(() => {
    Alert.alert('End the live?', `Your live on ${platformLabel} stops for everyone.`, [
      { text: 'Keep going', style: 'cancel' },
      { text: 'End live', style: 'destructive', onPress: () => void finish() },
    ])
  }, [finish, platformLabel])

  // The back gesture / button asks first instead of dropping the live.
  usePreventRemove(!ending && session.state.kind !== 'refused', () => confirmEnd())

  const refusedMessage = session.state.kind === 'refused' ? session.state.message : null
  if (setup.isPending || destination === undefined) return <Loading label="Getting your live ready" />
  if (!setup.data) return <ErrorState message="This setup couldn’t be opened." onRetry={() => router.back()} />
  if (destination === null) {
    return <ErrorState message={`There's no ${platformLabel} stream key on this phone. Add it on the Platforms tab.`} onRetry={() => router.back()} />
  }

  const landscape = setup.data.orientation === 'landscape'
  const stageHeight = landscape ? Math.round((window.width * 9) / 16) : undefined
  const sig = signal(status?.status, stats?.congestion)
  const isLive = status?.status === 'live' || status?.status === 'reconnecting'
  const reconnecting = status?.status === 'reconnecting'
  const failed = status?.status === 'failed'
  const battery = batteryLevel >= 0 ? Math.round(batteryLevel * 100) : null
  const currentMode = backgroundWithDefaults({ ...setup.data.background, ...overrides.background }).mode
  const currentFilter = cameraWithDefaults({ ...setup.data.camera, ...overrides.camera }).filter ?? 'none'

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={landscape ? { position: 'absolute', left: 0, right: 0, top: (window.height - (stageHeight ?? 0)) / 2.6, height: stageHeight } : StyleSheet.absoluteFill}>
        <LiveStreamerView
          ref={streamer}
          style={StyleSheet.absoluteFill}
          orientation={setup.data.orientation}
          resolution={params.quality === '1080p' ? '1080p' : '720p'}
          facing={params.facing === 'back' ? 'back' : 'front'}
          onStatus={(e) => onStatus(e.nativeEvent)}
          onStats={(e) => setStats(e.nativeEvent)}
          onError={(e) => {
            const { code, message } = e.nativeEvent
            // Blur and Picture need to find the person; without it the live goes on with the real room.
            if (code === 'segmentation') setSegmentationMissing(true)
            else if (code === 'microphone') setMicError(message)
            else setCameraError(message)
          }}
        />
      </View>

      {/* ---- top bar ---- */}
      <View style={[styles.topBar, { top: insets.top + 12 }]}>
        <View style={[styles.chip, { backgroundColor: isLive ? colors.dangerSolid : colors.overlay }]} accessibilityLabel={isLive ? `Live for ${clock((now - (liveSince ?? now)) / 1000)}` : 'Not live yet'}>
          <View style={styles.dot} />
          <Text style={styles.chipText}>{isLive ? `LIVE ${clock((now - (liveSince ?? now)) / 1000)}` : status?.status === 'connecting' ? 'CONNECTING' : 'NOT LIVE'}</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: colors.overlay }]}>
          <Text style={[styles.chipText, { fontWeight: '500' }]}>{platformLabel}</Text>
        </View>
        <View style={[styles.chip, { marginLeft: 'auto', backgroundColor: sig.tone === 'good' ? colors.overlay : colors.warningBg }]}>
          <View style={[styles.dot, { backgroundColor: sig.tone === 'good' ? colors.success : colors.warning }]} />
          <Text style={[styles.chipText, { fontWeight: '500', color: sig.tone === 'good' ? colors.text : colors.warning }]}>{sig.label}</Text>
        </View>
      </View>
      <View style={[styles.subBar, { top: insets.top + 52 }]}>
        {battery !== null && (
          <View style={[styles.miniChip, battery <= 20 && { backgroundColor: colors.warningBg }]}>
            <Icon name="battery" size={16} color={battery <= 20 ? colors.warning : colors.text2} />
            <Text style={{ color: battery <= 20 ? colors.warning : colors.text2, fontSize: 12 }}>{battery}%</Text>
          </View>
        )}
        {stats && isLive && (
          <View style={styles.miniChip}>
            <Text style={{ color: colors.text2, fontSize: 12 }}>{(stats.bitrateKbps / 1000).toFixed(1)} Mbps</Text>
          </View>
        )}
      </View>

      {/* ---- right rail ---- */}
      <View style={[styles.rail, { top: window.height * 0.38 }]}>
        <IconButton icon="flip" label="Flip camera" tone="overlay" size={52} onPress={() => void streamer.current?.switchCamera()} />
        <IconButton icon="sparkle" label="Background and filter" tone="overlay" size={52} onPress={() => setLookOpen(true)} />
        <IconButton
          icon={micMuted ? 'micOff' : 'mic'}
          label={micMuted ? 'Turn microphone on' : 'Mute microphone'}
          tone="overlay"
          size={52}
          onPress={() => {
            const next = !micMuted
            setMicMuted(next)
            void streamer.current?.setMicMuted(next)
          }}
        />
      </View>

      {micMuted && (
        <View style={[styles.banner, { top: insets.top + 88 }]} accessibilityLiveRegion="polite">
          <Icon name="micOff" size={18} color={colors.warning} />
          <Text style={{ color: colors.warning, fontSize: 14, fontWeight: '600' }}>Microphone muted — viewers can’t hear you</Text>
        </View>
      )}

      {segmentationMissing && !micMuted && (currentMode === 'blur' || currentMode === 'image') && (
        <Pressable onPress={() => setSegmentationMissing(false)} style={[styles.banner, { top: insets.top + 88 }]} accessibilityRole="button" accessibilityHint="Dismiss">
          <Icon name="alert" size={18} color={colors.warning} />
          <Text style={{ flex: 1, color: colors.warning, fontSize: 14, fontWeight: '600' }}>
            This phone can’t pick you out from the room, so viewers see your real background. Green screen still works.
          </Text>
        </Pressable>
      )}

      {/* ---- popup tray ---- */}
      <View style={[styles.tray, { paddingBottom: insets.bottom + 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.lg }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Popups</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Tap to show · tap again to hide</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingTop: 10 }}>
          {popups.map((p) => {
            const on = active.some((a) => a.key === p.key)
            return (
              <Pressable
                key={p.key}
                onPress={() => tapPopup(p)}
                accessibilityRole="button"
                accessibilityLabel={`${popupText(p)}${on ? ', showing' : ''}`}
                accessibilityState={{ selected: on }}
                style={[styles.popupButton, on && { borderColor: colors.success }]}
              >
                <PopupArt spec={resolveLook({ ...p, size: 100 })} unit={2.1} />
                {on && (
                  <View style={styles.onBadge}>
                    <Text style={{ color: colors.ink, fontSize: 11, fontWeight: '800' }}>ON</Text>
                  </View>
                )}
              </Pressable>
            )
          })}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg }}>
          <Button label="Sounds" icon="volume" variant="secondary" size="md" onPress={() => setSoundsOpen(true)} style={{ flex: 1 }} />
          <Button label="Hide all" icon="eyeOff" variant="secondary" size="md" onPress={hideAll} disabled={active.length === 0} style={{ flex: 1 }} />
          <Button label="End" variant="danger" size="md" onPress={confirmEnd} style={{ width: 92 }} accessibilityLabel="End the live" />
        </View>
      </View>

      {/* ---- sound pads ---- */}
      <Sheet visible={soundsOpen} onClose={() => setSoundsOpen(false)} title="Sound effects">
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Viewers hear it</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Off: only you hear it, to test</Text>
          </View>
          <Switch value={soundToStream} onValueChange={setToStream} trackColor={{ true: colors.success, false: colors.raised }} thumbColor="#FFFFFF" accessibilityLabel="Viewers hear it" />
        </View>
        <Segmented
          label="Volume"
          value={String(VOLUMES.reduce((best, v) => (Math.abs(Number(v.id) - soundVolume) < Math.abs(Number(best.id) - soundVolume) ? v : best)).id)}
          onChange={(v) => setVolume(Number(v))}
          options={VOLUMES.map((v) => ({ id: v.id, label: v.label }))}
        />
        <View style={styles.pads}>
          {SOUNDS.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => (soundToStream ? play(s.id) : void streamer.current?.playSound(s.id, soundVolume, false, true))}
              accessibilityRole="button"
              accessibilityLabel={`Play ${s.label}`}
              style={({ pressed }) => [styles.pad, { backgroundColor: s.color, opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* ---- background and filter, for this live only ---- */}
      <Sheet visible={lookOpen} onClose={() => setLookOpen(false)} title="Background and filter">
        <Text style={{ color: colors.muted, fontSize: 13 }}>Changes here are for this live only. Your setup stays as saved.</Text>
        <Text style={styles.sheetHeading}>Behind you</Text>
        <View style={styles.choiceRow} accessibilityRole="radiogroup" accessibilityLabel="Background">
          {BACKGROUND_MODES.map((m) => {
            const on = m.id === currentMode
            return (
              <Pressable
                key={m.id}
                onPress={() => setOverrides((o) => ({ ...o, background: { ...o.background, mode: m.id as BackgroundMode } }))}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[styles.choice, on && styles.choiceOn]}
              >
                <Text style={{ color: on ? colors.ink : colors.text, fontSize: 14, fontWeight: on ? '700' : '500' }}>{m.label}</Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={styles.sheetHeading}>Colour filter</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {CAMERA_FILTERS.map((f) => {
            const on = f.id === currentFilter
            return (
              <Pressable
                key={f.id}
                onPress={() => setOverrides((o) => ({ ...o, camera: { ...o.camera, filter: f.id as CameraFilterId } }))}
                accessibilityRole="radio"
                accessibilityLabel={`${f.label} filter`}
                accessibilityState={{ selected: on }}
                style={{ alignItems: 'center', gap: 4, width: 60 }}
              >
                <View style={[styles.filterSwatch, { backgroundColor: f.swatch[1], borderColor: on ? colors.link : 'transparent' }]}>
                  <View style={{ flex: 1, backgroundColor: f.swatch[0], opacity: 0.85, borderBottomRightRadius: 40 }} />
                </View>
                <Text style={{ color: on ? colors.text : colors.text2, fontSize: 11, fontWeight: on ? '700' : '500' }} numberOfLines={1}>
                  {f.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
        {(overrides.camera || overrides.background) && <Button label="Back to my setup’s look" variant="secondary" size="md" onPress={() => setOverrides({})} />}
      </Sheet>

      {micError && !refusedMessage && !cameraError && (
        <Cover title="Microphone problem" icon="alert">
          <Text style={styles.coverText}>{micError}</Text>
          <Text style={styles.coverText}>Close other apps that use the microphone (calls, voice recorders), then try again.</Text>
          <Button label="Back" variant="secondary" onPress={() => void leave()} style={{ alignSelf: 'stretch' }} />
        </Cover>
      )}

      {/* ---- states that cover the controls ---- */}
      {refusedMessage && (
        <Cover title="Going live isn't possible yet" icon="alert">
          <Text style={styles.coverText}>{refusedMessage}</Text>
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </Cover>
      )}
      {cameraError && !refusedMessage && (
        <Cover title="Camera problem" icon="alert">
          <Text style={styles.coverText}>{cameraError}</Text>
          <Button label="Back" variant="secondary" onPress={() => void (liveSince ? finish() : leave())} />
        </Cover>
      )}
      {reconnecting && (
        <Cover title={`Reconnecting to ${platformLabel}…`} icon="refresh">
          <Text style={styles.coverText}>Your internet dropped. Keep the app open — we’ll keep trying for about 2 minutes, and your live picks up where it left off.</Text>
          <View style={{ width: '100%', gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Trying again</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                Try {status?.attempt ?? 1} of {status?.maxAttempts ?? 1}
              </Text>
            </View>
            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: `${Math.min(100, ((status?.attempt ?? 0) / Math.max(1, status?.maxAttempts ?? 1)) * 100)}%` }]} />
            </View>
          </View>
          <Notice tone="warning">Move closer to your Wi-Fi router, or turn on mobile data.</Notice>
          <Button label="Try now" onPress={() => void streamer.current?.restartStream()} style={{ alignSelf: 'stretch' }} />
          <Button label="End live" variant="ghost" onPress={confirmEnd} style={{ alignSelf: 'stretch' }} />
        </Cover>
      )}
      {failed && !reconnecting && (
        <Cover title="The live stopped" icon="alert">
          <Text style={styles.coverText}>{failureMessage(status?.reason, platformLabel)}</Text>
          <Button label="Try again" onPress={() => void streamer.current?.restartStream()} style={{ alignSelf: 'stretch' }} />
          <Button label="End" variant="ghost" onPress={() => void finish()} style={{ alignSelf: 'stretch' }} />
        </Cover>
      )}
      {leftApp && !reconnecting && !failed && (
        <Pressable onPress={() => setLeftApp(false)} style={[styles.banner, { top: insets.top + 88 }]} accessibilityRole="button" accessibilityHint="Dismiss">
          <Icon name="alert" size={18} color={colors.warning} />
          <Text style={{ flex: 1, color: colors.warning, fontSize: 14, fontWeight: '600' }}>You left the app, so the camera paused. Stay in the app while live.</Text>
        </Pressable>
      )}
    </View>
  )
}

function Cover({ title, icon, children }: { title: string; icon: 'alert' | 'refresh'; children: ReactNode }) {
  return (
    <View style={styles.coverScrim}>
      <View style={styles.cover} accessibilityRole="alert">
        <View style={styles.coverIcon}>
          <Icon name={icon} size={30} color={colors.link} />
        </View>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  subBar: { position: 'absolute', right: space.lg, flexDirection: 'row', gap: 6 },
  chip: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 999 },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  miniChip: { height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.overlay },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  rail: { position: 'absolute', right: 12, gap: 12 },
  banner: { position: 'absolute', left: space.lg, right: space.lg, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.warningBg },
  tray: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 14, gap: space.md, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.tray },
  popupButton: { width: 88, height: 72, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  onBadge: { position: 'absolute', top: -9, alignSelf: 'center', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.success },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  pads: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pad: { width: '23.4%', height: 60, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  coverScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center', padding: space.xl },
  cover: { borderRadius: radius.sheet, backgroundColor: colors.surface, padding: space.xl, paddingTop: space.xxl, alignItems: 'center', gap: 14 },
  coverIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  coverText: { color: colors.text2, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  sheetHeading: { color: colors.text, fontSize: 15, fontWeight: '700' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  choiceOn: { backgroundColor: colors.text },
  filterSwatch: { width: 52, height: 52, borderRadius: radius.md, borderWidth: 2, overflow: 'hidden' },
  progress: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.link },
})
