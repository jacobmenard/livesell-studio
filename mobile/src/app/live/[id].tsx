import * as Battery from 'expo-battery'
import { useKeepAwake } from 'expo-keep-awake'
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, AppState, Dimensions, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native'
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
import { columnsFor, isTabletScreen, useLiveLayout } from '@/layout/device'
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
  // Where the picture and the controls go (phone, or one of the tablet layouts).
  const lay = useLiveLayout(setup.data?.orientation === 'landscape')
  // Tablets turn freely, so the camera follows the screen (src/layout/orientation.ts).
  const [followRotation] = useState(() => isTabletScreen(Dimensions.get('screen')))
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

  const tablet = lay.mode !== 'phone'
  const sig = signal(status?.status, stats?.congestion)
  const isLive = status?.status === 'live' || status?.status === 'reconnecting'
  const reconnecting = status?.status === 'reconnecting'
  const failed = status?.status === 'failed'
  const battery = batteryLevel >= 0 ? Math.round(batteryLevel * 100) : null
  const currentMode = backgroundWithDefaults({ ...setup.data.background, ...overrides.background }).mode
  const currentFilter = cameraWithDefaults({ ...setup.data.camera, ...overrides.camera }).filter ?? 'none'

  // ---- pieces shared by the tablet layouts ------------------------------------------------

  /** Chips and banners sit on the picture: within its box when it doesn't fill the screen. */
  const boxed = lay.mode === 'columns'
  const onPicture = boxed
    ? { left: lay.stage.x + 12, right: window.width - (lay.stage.x + lay.stage.w) + 12, top: lay.stage.y + 12 }
    : { left: space.lg, right: space.lg, top: insets.top + 12 }

  const popupGrid = (width: number) => {
    const cols = columnsFor(width, 120, space.md, 6)
    const tile = Math.floor((width - space.md * (cols - 1)) / cols)
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingTop: 10 }}>
        {popups.map((p) => {
          const on = active.some((a) => a.key === p.key)
          return (
            <Pressable
              key={p.key}
              onPress={() => tapPopup(p)}
              accessibilityRole="button"
              accessibilityLabel={`${popupText(p)}${on ? ', showing' : ''}`}
              accessibilityState={{ selected: on }}
              style={[styles.popupButton, { width: tile, height: 80 }, on && { borderColor: colors.success }]}
            >
              <PopupArt spec={resolveLook({ ...p, size: 100 })} unit={2.4} />
              {on && (
                <View style={styles.onBadge}>
                  <Text style={{ color: colors.ink, fontSize: 11, fontWeight: '800' }}>ON</Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </View>
    )
  }

  const popupsTitle = (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <Text style={styles.sectionTitle}>Popups</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>Tap to show · tap again to hide</Text>
    </View>
  )

  /** Sound pads always on screen (tablets). `limit` leaves room for an "All sounds" pad. */
  const soundPads = (width: number, limit?: number) => {
    const shown = limit ? SOUNDS.slice(0, limit) : SOUNDS
    const cols = limit ? shown.length + 1 : columnsFor(width, 96, space.sm, 4)
    const pad = Math.floor((width - space.sm * (cols - 1)) / cols)
    return (
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
          <Text style={styles.sectionTitle}>Sounds</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: colors.text2, fontSize: 14 }}>Viewers hear it</Text>
            <Switch value={soundToStream} onValueChange={setToStream} trackColor={{ true: colors.success, false: colors.raised }} thumbColor="#FFFFFF" accessibilityLabel="Viewers hear it" />
          </View>
        </View>
        <View style={styles.pads}>
          {shown.map((sound) => (
            <Pressable
              key={sound.id}
              onPress={() => (soundToStream ? play(sound.id) : void streamer.current?.playSound(sound.id, soundVolume, false, true))}
              accessibilityRole="button"
              accessibilityLabel={`Play ${sound.label}`}
              style={({ pressed }) => [styles.pad, { width: pad, backgroundColor: sound.color, opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                {sound.label}
              </Text>
            </Pressable>
          ))}
          {limit && (
            <Pressable onPress={() => setSoundsOpen(true)} accessibilityRole="button" accessibilityLabel="All sounds and volume" style={[styles.pad, { width: pad, backgroundColor: colors.surface2 }]}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>All {SOUNDS.length}</Text>
            </Pressable>
          )}
        </View>
      </View>
    )
  }

  /** Flip, background and microphone as labelled buttons (tablet panels). */
  const cameraControls = (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <ControlButton icon="flip" label="Flip" onPress={() => void streamer.current?.switchCamera()} />
      <ControlButton icon="sparkle" label="Background" onPress={() => setLookOpen(true)} />
      <ControlButton
        icon={micMuted ? 'micOff' : 'mic'}
        label={micMuted ? 'Mic off' : 'Mute mic'}
        warn={micMuted}
        onPress={() => {
          const next = !micMuted
          setMicMuted(next)
          void streamer.current?.setMicMuted(next)
        }}
      />
    </View>
  )

  const endButtons = (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <Button label="Hide all popups" icon="eyeOff" variant="secondary" size="md" onPress={hideAll} disabled={active.length === 0} style={{ flex: 1 }} />
      <Button label="End live" variant="danger" size="md" onPress={confirmEnd} style={{ width: 140 }} accessibilityLabel="End the live" />
    </View>
  )

  const turnNotice = lay.turn && (
    <Notice tone="warning" title={lay.turn === 'upright' ? 'Stand the tablet upright' : 'Turn the tablet sideways'}>
      {lay.turn === 'upright'
        ? 'This live is portrait, so viewers now get the middle of your camera picture. Upright, they get all of it, sharper.'
        : 'This live is landscape, so viewers now get the middle of your camera picture. Sideways, they get all of it, sharper.'}
    </Notice>
  )

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* The camera keeps this place in every layout (only its box moves), so turning a tablet never restarts it. */}
      <View style={{ position: 'absolute', left: lay.stage.x, top: lay.stage.y, width: lay.stage.w, height: lay.stage.h, overflow: 'hidden', borderRadius: boxed ? radius.lg : 0 }}>
        <LiveStreamerView
          ref={streamer}
          style={StyleSheet.absoluteFill}
          orientation={setup.data.orientation}
          followRotation={followRotation}
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
      <View style={[styles.topBar, onPicture]}>
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
      <View style={[styles.subBar, { top: onPicture.top + 40, right: onPicture.right }]}>
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

      {/* ---- right rail (phones, and tablets with the camera full screen) ---- */}
      {(lay.mode === 'phone' || lay.mode === 'overlay') && (
        <View style={[styles.rail, { top: window.height * (tablet ? 0.32 : 0.38), right: tablet ? 24 : 12, gap: tablet ? 14 : 12 }]}>
          <IconButton icon="flip" label="Flip camera" tone="overlay" size={tablet ? 60 : 52} onPress={() => void streamer.current?.switchCamera()} />
          <IconButton icon="sparkle" label="Background and filter" tone="overlay" size={tablet ? 60 : 52} onPress={() => setLookOpen(true)} />
          <IconButton
            icon={micMuted ? 'micOff' : 'mic'}
            label={micMuted ? 'Turn microphone on' : 'Mute microphone'}
            tone="overlay"
            size={tablet ? 60 : 52}
            onPress={() => {
              const next = !micMuted
              setMicMuted(next)
              void streamer.current?.setMicMuted(next)
            }}
          />
        </View>
      )}

      {micMuted && (
        <View style={[styles.banner, { left: onPicture.left, right: onPicture.right, top: onPicture.top + 76 }]} accessibilityLiveRegion="polite">
          <Icon name="micOff" size={18} color={colors.warning} />
          <Text style={{ color: colors.warning, fontSize: 14, fontWeight: '600' }}>Microphone muted — viewers can’t hear you</Text>
        </View>
      )}

      {segmentationMissing && !micMuted && (currentMode === 'blur' || currentMode === 'image') && (
        <Pressable onPress={() => setSegmentationMissing(false)} style={[styles.banner, { left: onPicture.left, right: onPicture.right, top: onPicture.top + 76 }]} accessibilityRole="button" accessibilityHint="Dismiss">
          <Icon name="alert" size={18} color={colors.warning} />
          <Text style={{ flex: 1, color: colors.warning, fontSize: 14, fontWeight: '600' }}>
            This {tablet ? 'tablet' : 'phone'} can’t pick you out from the room, so viewers see your real background. Green screen still works.
          </Text>
        </Pressable>
      )}

      {/* ---- tablet: camera full screen, a bigger tray with popups and sounds always showing ---- */}
      {lay.mode === 'overlay' && (
        <View style={[styles.tray, { paddingHorizontal: 24, paddingTop: 20, paddingBottom: insets.bottom + 24, gap: 14 }]}>
          {popupsTitle}
          <ScrollView style={{ maxHeight: 2 * 80 + space.md + 14 }} showsVerticalScrollIndicator={false}>
            {popupGrid(window.width - 48)}
          </ScrollView>
          {soundPads(window.width - 48, 6)}
          {endButtons}
        </View>
      )}

      {/* ---- tablet: the picture with a control panel beside it (or under it) ---- */}
      {lay.panel && (
        <ScrollView
          style={{ position: 'absolute', left: lay.panel.x, top: lay.panel.y, width: lay.panel.w, height: lay.panel.h }}
          contentContainerStyle={{ gap: 18, paddingBottom: space.lg }}
          showsVerticalScrollIndicator={false}
        >
          {turnNotice}
          {cameraControls}
          {!lay.under && (
            <View>
              {popupsTitle}
              {popupGrid(lay.panel.w)}
            </View>
          )}
          {soundPads(lay.panel.w, lay.mode === 'stacked' ? 6 : undefined)}
          {endButtons}
        </ScrollView>
      )}
      {lay.under && (
        <ScrollView style={{ position: 'absolute', left: lay.under.x, top: lay.under.y, width: lay.under.w, height: lay.under.h }} showsVerticalScrollIndicator={false}>
          {popupsTitle}
          {popupGrid(lay.under.w)}
        </ScrollView>
      )}

      {/* ---- phone: popup tray ---- */}
      {lay.mode === 'phone' && (
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
      )}

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
        <Pressable onPress={() => setLeftApp(false)} style={[styles.banner, { left: onPicture.left, right: onPicture.right, top: onPicture.top + 76 }]} accessibilityRole="button" accessibilityHint="Dismiss">
          <Icon name="alert" size={18} color={colors.warning} />
          <Text style={{ flex: 1, color: colors.warning, fontSize: 14, fontWeight: '600' }}>You left the app, so the camera paused. Stay in the app while live.</Text>
        </Pressable>
      )}
    </View>
  )
}

function ControlButton({ icon, label, onPress, warn = false }: { icon: 'flip' | 'sparkle' | 'mic' | 'micOff'; label: string; onPress: () => void; warn?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.control, warn && { backgroundColor: colors.warningBg }, pressed && { opacity: 0.75 }]}
    >
      <Icon name={icon} size={24} color={warn ? colors.warning : colors.text} />
      <Text style={{ color: warn ? colors.warning : colors.text, fontSize: 13, fontWeight: '500' }}>{label}</Text>
    </Pressable>
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
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  control: { flex: 1, height: 72, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 4 },
  sheetHeading: { color: colors.text, fontSize: 15, fontWeight: '700' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  choiceOn: { backgroundColor: colors.text },
  filterSwatch: { width: 52, height: 52, borderRadius: radius.md, borderWidth: 2, overflow: 'hidden' },
  progress: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.link },
})
