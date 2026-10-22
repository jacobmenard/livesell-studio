import { router, useLocalSearchParams, useNavigation, usePreventRemove } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { errorMessage } from '@/api/client'
import type { AutoHide, BackgroundSettings, CameraSettings, EffectId, EffectRepeat, ForegroundSettings, PopupConfig, Position, SetupDocument, SetupFull, SoundRef, TextColor } from '@/api/types'
import { Icon } from '@/components/Icon'
import { PopupArt } from '@/components/PopupArt'
import { BackgroundSection } from '@/components/editor/BackgroundSection'
import { CameraSection } from '@/components/editor/CameraSection'
import { ForegroundSection } from '@/components/editor/ForegroundSection'
import { LookSlider } from '@/components/editor/parts'
import { StagePreview, type PopupGestureHandlers } from '@/components/editor/StagePreview'
import { Button, Card, ErrorState, Field, Loading, Row, ScreenHeader, Segmented, Sheet } from '@/components/ui'
import { AUTO_HIDES, EFFECTS, isBuiltinSound, POPUP_SIZE, SOUND_BY_ID, SOUNDS, TEXT_COLORS } from '@/catalog'
import { useMedia, useSaveSetup, useSetup } from '@/hooks/queries'
import { isFreelyPlaced, popupText, resolveLook } from '@/stage/look'
import { checkPopupText, MAX_TEXT_LENGTH, newTextPopup, removePopup, updatePopup } from '@/stage/popups'
import { documentForApi, documentFromSetup } from '@/stage/scene'
import { nativeLook } from '@/stage/stageLook'
import { colors, radius, space } from '@/theme'

type Tab = 'camera' | 'background' | 'popups' | 'foreground' | 'sounds'

const TABS: { id: Tab; label: string }[] = [
  { id: 'camera', label: 'Camera' },
  { id: 'background', label: 'Background' },
  { id: 'popups', label: 'Popups' },
  { id: 'foreground', label: 'Foreground' },
  { id: 'sounds', label: 'Sounds' },
]
type SheetKind = 'effect' | 'sound' | 'hide' | 'position' | 'text' | null

/** The size slider's top end; pinching on the preview goes up to the API's 1500%. */
const SLIDER_MAX_SIZE = 500

const clampSize = (size: number) => Math.round(Math.min(POPUP_SIZE.max, Math.max(POPUP_SIZE.min, size)))

const POSITION_LABELS: Record<Position, string> = {
  tl: 'Top left',
  tc: 'Top centre',
  tr: 'Top right',
  ml: 'Middle left',
  mc: 'Centre',
  mr: 'Middle right',
  bl: 'Bottom left',
  bc: 'Bottom centre',
  br: 'Bottom right',
}

const VOLUMES = [
  { id: '40', label: 'Soft' },
  { id: '70', label: 'Medium' },
  { id: '100', label: 'Loud' },
] as const

function soundLabel(sound: SoundRef | null): string {
  if (!sound) return 'No sound'
  return isBuiltinSound(sound) ? SOUND_BY_ID[sound].label : 'Your own sound'
}

function stable(doc: SetupDocument): string {
  return JSON.stringify(documentForApi(doc))
}

export default function EditorScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const setup = useSetup(Number(params.id))

  if (setup.isPending) return <Loading />
  if (!setup.data) return <ErrorState message={errorMessage(setup.error, 'This setup couldn’t be opened.')} onRetry={() => void setup.refetch()} />
  if (setup.data.is_template) {
    return <ErrorState message="Templates can’t be changed. Use the template to make your own setup first." onRetry={() => router.back()} />
  }
  // Editing starts from the setup as loaded; later refetches don't overwrite unsaved changes.
  return <Editor key={setup.data.id} setup={setup.data} />
}

function Editor({ setup }: { setup: SetupFull }) {
  const id = setup.id
  const save = useSaveSetup(id)
  const navigation = useNavigation()

  const [doc, setDoc] = useState<SetupDocument>(() => documentFromSetup(setup))
  const [base, setBase] = useState(() => stable(documentFromSetup(setup)))
  const [selected, setSelected] = useState<string | null>(() => setup.popups[0]?.key ?? null)
  const [tab, setTab] = useState<Tab>('popups')
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [newText, setNewText] = useState('')
  const [newColor, setNewColor] = useState<TextColor>('yellow')
  const [textError, setTextError] = useState<string | undefined>()
  const [segmentationMissing, setSegmentationMissing] = useState(false)
  const [zoomLimit, setZoomLimit] = useState<string | null>(null)
  /** When the selected popup's entrance and effect last started playing in the preview. */
  const [playedAt, setPlayedAt] = useState(() => Date.now())
  /** A finger is on the preview, moving or resizing a popup: the page doesn't scroll meanwhile. */
  const [touching, setTouching] = useState(false)
  const pinchFrom = useRef<number>(POPUP_SIZE.default)
  const media = useMedia()

  const dirty = stable(doc) !== base

  usePreventRemove(dirty && !save.isPending, ({ data }) => {
    Alert.alert('Leave without saving?', 'Your changes to this setup will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  })

  const popup = useMemo(() => doc.popups.find((p) => p.key === selected) ?? null, [doc, selected])

  const change = (next: Partial<SetupDocument>) => setDoc((d) => ({ ...d, ...next }))
  const changeCamera = (c: Partial<CameraSettings>) => setDoc((d) => ({ ...d, camera: { ...d.camera, ...c } }))
  const changeBackground = (c: Partial<BackgroundSettings>) => setDoc((d) => ({ ...d, background: { ...d.background, ...c } }))
  const changeForeground = (c: Partial<ForegroundSettings>) => setDoc((d) => ({ ...d, foreground: { ...d.foreground, ...c } }))
  const changePopup = (c: Partial<PopupConfig>) => selected && setDoc((d) => ({ ...d, popups: updatePopup(d.popups, selected, c) }))
  const replay = () => setPlayedAt(Date.now())

  const persist = async (): Promise<boolean> => {
    try {
      const saved = await save.mutateAsync(documentForApi(doc))
      const d = documentFromSetup(saved)
      setDoc(d)
      setBase(stable(d))
      return true
    } catch (error) {
      Alert.alert('Not saved', errorMessage(error))
      return false
    }
  }

  const goLive = async () => {
    if (dirty && !(await persist())) return
    router.push({ pathname: '/live/check', params: { setupId: String(id) } })
  }

  const addText = () => {
    const problem = checkPopupText(newText)
    setTextError(problem)
    if (problem) return
    const created = newTextPopup(newText, newColor)
    setDoc((d) => ({ ...d, popups: [...d.popups, created] }))
    setSelected(created.key)
    setNewText('')
    setSheet(null)
  }

  const portrait = doc.orientation === 'portrait'
  const stageW = portrait ? 168 : 320
  const stageH = portrait ? 300 : 180
  const mediaList = useMemo(() => media.data ?? [], [media.data])
  // Only while nothing was ever fetched: a failed refresh keeps showing the pictures it has.
  const mediaError = media.isError && !media.data ? errorMessage(media.error, 'Check your internet and try again.') : null
  const retryMedia = () => void media.refetch()
  const look = useMemo(() => nativeLook(doc, mediaList), [doc, mediaList])
  // The popup only shows on the Popups step, so the look is easy to judge on the others.
  const overlay = useMemo(() => (tab === 'popups' && popup ? [resolveLook(popup, playedAt)] : []), [tab, popup, playedAt])

  const popupGestures: PopupGestureHandlers | undefined =
    tab === 'popups' && popup
      ? {
          onPlace: (x, y) => changePopup({ x, y }),
          onPinch: (phase, ratio) => {
            if (phase === 'start') pinchFrom.current = popup.size
            else if (phase === 'move') changePopup({ size: clampSize(pinchFrom.current * ratio) })
          },
          onActive: setTouching,
        }
      : undefined

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title={doc.name}
        subtitle={save.isPending ? 'Saving…' : dirty ? 'Not saved yet' : 'All changes saved'}
        onBack={() => router.back()}
        right={<Button label="Save" variant="secondary" size="md" onPress={() => void persist()} disabled={!dirty} busy={save.isPending} />}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: space.lg }} scrollEnabled={!touching}>
        <View style={styles.previewBox} accessibilityLabel={popup ? `Preview of ${popupText(popup)}` : 'Preview'}>
          <StagePreview
            width={stageW}
            height={stageH}
            orientation={doc.orientation}
            resolution={doc.resolution}
            look={look}
            overlay={overlay}
            onSegmentationMissing={() => setSegmentationMissing(true)}
            onZoomLimit={setZoomLimit}
            popupGestures={popupGestures}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md }}
          accessibilityRole="tablist"
        >
          {TABS.map((t) => {
            const on = t.id === tab
            return (
              <Pressable key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.tabChip, on && styles.tabChipOn]}>
                <Text style={{ color: on ? colors.ink : colors.text, fontSize: 14, fontWeight: on ? '700' : '500' }}>{t.label}</Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {tab === 'popups' && (
          <View style={{ padding: space.lg, gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.h2}>Tap a popup to style it</Text>
              <Pressable onPress={() => setSheet('text')} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: colors.link, fontSize: 14, fontWeight: '500' }}>+ Make your own</Text>
              </Pressable>
            </View>
            <View style={styles.grid}>
              {doc.popups.map((p) => {
                const on = p.key === selected
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => {
                      setSelected(p.key)
                      replay()
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={popupText(p)}
                    accessibilityState={{ selected: on }}
                    style={[styles.tile, on && { borderColor: colors.link }]}
                  >
                    <PopupArt spec={resolveLook({ ...p, size: 100 })} unit={2.1} />
                    {on && (
                      <View style={styles.check}>
                        <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3.4} />
                      </View>
                    )}
                  </Pressable>
                )
              })}
            </View>

            {popup && (
              <Card>
                <Row label={`Effect for ${popupText(popup)}`} value={EFFECTS.find((e) => e.id === popup.effect)?.label ?? 'None'} onPress={() => setSheet('effect')} />
                <Row label="Sound" value={soundLabel(popup.sound)} onPress={() => setSheet('sound')} />
                <Row label="Hide after" value={AUTO_HIDES.find((a) => a.id === popup.auto_hide)?.label ?? 'Never'} onPress={() => setSheet('hide')} />
                <Row
                  label="Position"
                  value={isFreelyPlaced(popup) ? 'Placed by hand' : POSITION_LABELS[popup.position]}
                  onPress={() => setSheet('position')}
                  last={popup.kind === 'preset' && popup.effect === 'none' && popup.entrance === 'none'}
                />
                {(popup.effect !== 'none' || popup.entrance !== 'none') && <Row label="Play it again" onPress={replay} last={popup.kind === 'preset'} />}
                {popup.kind !== 'preset' && (
                  <Row
                    label="Remove this popup"
                    danger
                    last
                    onPress={() => {
                      setDoc((d) => ({ ...d, popups: removePopup(d.popups, popup.key) }))
                      setSelected(doc.popups[0]?.key ?? null)
                    }}
                  />
                )}
              </Card>
            )}

            {popup && (
              <View style={{ gap: space.xs }}>
                <LookSlider
                  label="Size"
                  value={Math.min(SLIDER_MAX_SIZE, popup.size)}
                  min={POPUP_SIZE.min}
                  max={SLIDER_MAX_SIZE}
                  onChange={(size) => changePopup({ size })}
                  low="Smaller"
                  high="Bigger"
                  format={() => `${popup.size}%`}
                />
                <Text style={styles.help}>On the preview: drag to put the popup anywhere, pinch with two fingers to resize it.</Text>
              </View>
            )}
          </View>
        )}

        {tab === 'camera' && (
          <CameraSection
            camera={doc.camera}
            orientation={doc.orientation}
            resolution={doc.resolution}
            zoomLimit={zoomLimit}
            onCamera={changeCamera}
            onShape={(c) => change(c)}
          />
        )}

        {tab === 'background' && (
          <BackgroundSection
            background={doc.background}
            media={mediaList}
            mediaLoading={media.isPending}
            mediaError={mediaError}
            onRetryMedia={retryMedia}
            segmentationMissing={segmentationMissing}
            onChange={changeBackground}
          />
        )}

        {tab === 'foreground' && (
          <ForegroundSection
            foreground={doc.foreground}
            media={mediaList}
            mediaLoading={media.isPending}
            mediaError={mediaError}
            onRetryMedia={retryMedia}
            onChange={changeForeground}
          />
        )}

        {tab === 'sounds' && (
          <View style={{ padding: space.lg, gap: space.lg }}>
            <View style={{ gap: space.sm }}>
              <Text style={styles.h2}>Volume</Text>
              <Segmented
                label="Volume"
                value={String(VOLUMES.reduce((best, v) => (Math.abs(Number(v.id) - doc.sound_settings.volume) < Math.abs(Number(best.id) - doc.sound_settings.volume) ? v : best)).id)}
                onChange={(v) => change({ sound_settings: { ...doc.sound_settings, volume: Number(v) } })}
                options={VOLUMES.map((v) => ({ id: v.id, label: v.label }))}
              />
            </View>
            <Card>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Viewers hear sounds</Text>
                  <Text style={styles.help}>Mixed into the live. Off: sounds play only on your phone, to test.</Text>
                </View>
                <Switch
                  value={doc.sound_settings.to_stream}
                  onValueChange={(to_stream) => change({ sound_settings: { ...doc.sound_settings, to_stream } })}
                  trackColor={{ true: colors.success, false: colors.raised }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel="Viewers hear sounds"
                />
              </View>
              <View style={[styles.switchRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Also play on my speaker</Text>
                  <Text style={styles.help}>Use earphones, or the microphone picks it up a second time.</Text>
                </View>
                <Switch
                  value={doc.sound_settings.monitor}
                  onValueChange={(monitor) => change({ sound_settings: { ...doc.sound_settings, monitor } })}
                  trackColor={{ true: colors.success, false: colors.raised }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel="Also play on my speaker"
                />
              </View>
            </Card>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Go live with this setup" variant="danger" dot onPress={() => void goLive()} busy={save.isPending} />
      </View>

      {/* ---- popup settings ---- */}
      <Sheet visible={sheet === 'effect'} onClose={() => setSheet(null)} title="Effect">
        <Options<EffectId>
          options={EFFECTS.map((e) => ({ id: e.id, label: e.label }))}
          value={popup?.effect ?? 'none'}
          onPick={(effect) => {
            changePopup({ effect })
            replay()
            setSheet(null)
          }}
        />
        <Segmented<EffectRepeat>
          label="How long it plays"
          value={popup?.effect_repeat ?? 'once'}
          onChange={(effect_repeat) => {
            changePopup({ effect_repeat })
            replay()
          }}
          options={[
            { id: 'once', label: 'Play once' },
            { id: 'loop', label: 'Keep playing' },
          ]}
        />
        <Text style={styles.help}>Plays each time the popup shows, in your live and on the website’s clean screen. Turn on your camera in the preview to see it here.</Text>
      </Sheet>
      <Sheet visible={sheet === 'sound'} onClose={() => setSheet(null)} title="Sound when it shows">
        <ScrollView style={{ maxHeight: 420 }}>
          <Options<string>
            options={[{ id: '', label: 'No sound' }, ...SOUNDS.map((s) => ({ id: s.id, label: s.label }))]}
            value={popup?.sound ?? ''}
            onPick={(sound) => {
              changePopup({ sound: (sound || null) as SoundRef | null })
              setSheet(null)
            }}
          />
        </ScrollView>
      </Sheet>
      <Sheet visible={sheet === 'hide'} onClose={() => setSheet(null)} title="Hide after">
        <Options<string>
          options={AUTO_HIDES.map((a) => ({ id: String(a.id), label: a.label }))}
          value={String(popup?.auto_hide ?? 0)}
          onPick={(v) => {
            changePopup({ auto_hide: Number(v) as AutoHide })
            setSheet(null)
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'position'} onClose={() => setSheet(null)} title="Position">
        <View style={styles.posGrid} accessibilityRole="radiogroup" accessibilityLabel="Position">
          {(Object.keys(POSITION_LABELS) as Position[]).map((pos) => {
            const on = popup?.position === pos && popup.x === null
            return (
              <Pressable
                key={pos}
                onPress={() => {
                  changePopup({ position: pos, x: null, y: null })
                  setSheet(null)
                }}
                accessibilityRole="radio"
                accessibilityLabel={POSITION_LABELS[pos]}
                accessibilityState={{ selected: on }}
                style={[styles.posCell, on && { backgroundColor: colors.primary }]}
              >
                <View style={[styles.posDot, on && { backgroundColor: '#FFFFFF' }]} />
              </Pressable>
            )
          })}
        </View>
        <Text style={styles.help}>Keep popups out of the bottom third: that’s where TikTok and Facebook show comments.</Text>
      </Sheet>
      <Sheet visible={sheet === 'text'} onClose={() => setSheet(null)} title="Make your own popup">
        <Field
          label="Words on the popup"
          value={newText}
          onChangeText={(t) => {
            setNewText(t)
            setTextError(undefined)
          }}
          maxLength={MAX_TEXT_LENGTH}
          autoCapitalize="characters"
          error={textError}
          help={`Up to ${MAX_TEXT_LENGTH} characters, like “₱99 ONLY” or “MINE NA!”.`}
        />
        <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Colour">
          {TEXT_COLORS.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setNewColor(c.id)}
              accessibilityRole="radio"
              accessibilityLabel={c.name}
              accessibilityState={{ selected: newColor === c.id }}
              style={[styles.swatch, { backgroundColor: c.bg }, newColor === c.id && styles.swatchOn]}
            />
          ))}
        </View>
        <Button label="Add popup" onPress={addText} />
      </Sheet>
    </SafeAreaView>
  )
}

function Options<T extends string>({ options, value, onPick }: { options: { id: T; label: string }[]; value: T; onPick: (id: T) => void }) {
  return (
    <Card style={{ backgroundColor: colors.surface2 }}>
      {options.map((o, i) => {
        const on = o.id === value
        return (
          <Pressable
            key={o.id || 'none'}
            onPress={() => onPick(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.option, i < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }]}
          >
            <Text style={{ flex: 1, color: colors.text, fontSize: 16 }}>{o.label}</Text>
            {on && <Icon name="check" size={20} color={colors.link} />}
          </Pressable>
        )
      })}
    </Card>
  )
}

const styles = StyleSheet.create({
  previewBox: { height: 316, marginHorizontal: space.lg, marginTop: space.sm, borderRadius: 18, backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center' },
  h2: { color: colors.text, fontSize: 15, fontWeight: '700' },
  tabChip: { minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  tabChipOn: { backgroundColor: colors.text },
  help: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '31.6%',
    height: 68,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  check: { position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.surface },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 14, minHeight: 64 },
  switchLabel: { color: colors.text, fontSize: 16, fontWeight: '500' },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  posGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignSelf: 'center', width: 3 * 72 + 2 * space.sm },
  posCell: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  posDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.muted },
  swatch: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: 'transparent' },
  swatchOn: { borderColor: '#FFFFFF' },
})
