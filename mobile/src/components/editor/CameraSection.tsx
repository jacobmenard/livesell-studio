import { Pressable, ScrollView, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

import type { CameraSettings, Orientation, Resolution } from '@/api/types'
import { Icon } from '@/components/Icon'
import { Card, Notice, Segmented } from '@/components/ui'
import { CAMERA_FILTERS, DEFAULT_FILTER_STRENGTH, LOOK_PRESETS, LOOK_SLIDERS, NEUTRAL_LOOK, sameLook, type CameraLook } from '@/stage/filters'
import { cameraWithDefaults } from '@/stage/stageLook'
import { colors, radius, space } from '@/theme'
import { LookSlider, SectionTitle, styles, SwitchRow } from './parts'

export function CameraSection({
  camera: saved,
  orientation,
  resolution,
  onCamera,
  onShape,
}: {
  camera: CameraSettings
  orientation: Orientation
  resolution: Resolution
  onCamera: (change: Partial<CameraSettings>) => void
  onShape: (change: { orientation?: Orientation; resolution?: Resolution }) => void
}) {
  const camera = cameraWithDefaults(saved)
  const look: CameraLook = {
    brightness: camera.brightness,
    contrast: camera.contrast ?? NEUTRAL_LOOK.contrast,
    saturation: camera.saturation ?? NEUTRAL_LOOK.saturation,
    warmth: camera.warmth ?? NEUTRAL_LOOK.warmth,
    smoothing: camera.smoothing ?? NEUTRAL_LOOK.smoothing,
  }
  const filter = camera.filter ?? 'none'
  const strength = camera.filter_strength ?? DEFAULT_FILTER_STRENGTH
  const hasFaceEffect = !!camera.effect && camera.effect !== 'none'

  return (
    <View style={{ padding: space.lg, gap: space.xl }}>
      <View style={{ gap: space.sm }}>
        <SectionTitle>Shape</SectionTitle>
        <Segmented
          label="Shape"
          value={orientation}
          onChange={(o) => onShape({ orientation: o })}
          options={[
            { id: 'portrait', label: 'Portrait 9:16' },
            { id: 'landscape', label: 'Landscape 16:9' },
          ]}
        />
        <Text style={styles.help}>Portrait fits TikTok and Facebook on phones. Landscape fits YouTube.</Text>
      </View>

      <View style={{ gap: space.sm }}>
        <SectionTitle>Quality</SectionTitle>
        <Segmented
          label="Quality"
          value={resolution}
          onChange={(r) => onShape({ resolution: r })}
          options={[
            { id: '720p', label: '720p · best for data' },
            { id: '1080p', label: '1080p · sharper' },
          ]}
        />
      </View>

      <View style={{ gap: space.md }}>
        <SectionTitle>Framing</SectionTitle>
        <LookSlider
          label="Zoom"
          value={Math.max(0, camera.zoom)}
          onChange={(zoom) => onCamera({ zoom })}
          low="Whole picture"
          high="Closer"
          format={(v) => `${(1 + v / 100).toFixed(1)}×`}
        />
        <Card>
          <SwitchRow label="Mirror" help="Flips the picture left to right, so writing on your products reads the right way." value={camera.mirror} onChange={(mirror) => onCamera({ mirror })} />
        </Card>
      </View>

      <View style={{ gap: space.md }}>
        <SectionTitle
          right={
            !sameLook(look, NEUTRAL_LOOK) ? (
              <Pressable onPress={() => onCamera(NEUTRAL_LOOK)} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: colors.link, fontSize: 14, fontWeight: '500' }}>Reset</Text>
              </Pressable>
            ) : undefined
          }
        >
          Look
        </SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Quick looks">
          {LOOK_PRESETS.map((p) => {
            const on = sameLook(look, p.look)
            return (
              <Pressable
                key={p.id}
                onPress={() => onCamera(p.look)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={styles.chipText}>{p.label}</Text>
              </Pressable>
            )
          })}
        </View>
        {LOOK_SLIDERS.map((s) => (
          <LookSlider key={s.key} label={s.label} value={look[s.key]} onChange={(v) => onCamera({ [s.key]: v })} low={s.low} high={s.high} hint={s.hint} />
        ))}
      </View>

      <View style={{ gap: space.md }}>
        <SectionTitle>Colour filter</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ marginHorizontal: -space.lg }}>
          <View style={{ width: space.lg - space.sm }} />
          {CAMERA_FILTERS.map((f) => {
            const on = f.id === filter
            return (
              <Pressable
                key={f.id}
                onPress={() => onCamera({ filter: f.id })}
                accessibilityRole="radio"
                accessibilityLabel={`${f.label} filter`}
                accessibilityState={{ selected: on }}
                style={{ width: 68, alignItems: 'center', gap: 6 }}
              >
                <View style={{ width: 60, height: 60, borderRadius: radius.md, borderWidth: 2, borderColor: on ? colors.link : 'transparent', overflow: 'hidden' }}>
                  <Svg width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none" accessible={false}>
                    <Defs>
                      <LinearGradient id={`g-${f.id}`} x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor={f.swatch[0]} />
                        <Stop offset="1" stopColor={f.swatch[1]} />
                      </LinearGradient>
                    </Defs>
                    <Rect width={10} height={10} fill={`url(#g-${f.id})`} />
                  </Svg>
                  {on && (
                    <View style={styles.check}>
                      <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3.4} />
                    </View>
                  )}
                </View>
                <Text style={{ color: on ? colors.text : colors.text2, fontSize: 12, fontWeight: on ? '700' : '500' }} numberOfLines={1}>
                  {f.label}
                </Text>
              </Pressable>
            )
          })}
          <View style={{ width: space.lg - space.sm }} />
        </ScrollView>
        {filter !== 'none' && <LookSlider label="Filter strength" value={strength} onChange={(filter_strength) => onCamera({ filter_strength })} low="Light" high="Full" format={(v) => `${v}%`} />}
      </View>

      {hasFaceEffect && (
        <Notice title="Face effect">
          This setup has a face effect from the website. It shows on the website’s clean screen; the phone’s live doesn’t draw face effects yet.
        </Notice>
      )}
    </View>
  )
}
