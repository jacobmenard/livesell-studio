import { Image, StyleSheet, Text, View } from 'react-native'

import type { PopupDrawSpec } from '@/stage/look'
import { DISPLAY_FONT } from '@/theme'

/**
 * One popup drawn with React Native, using the same box rules as the native renderer
 * (modules/live-streamer/.../OverlayRenderer.kt) so the editor preview matches the stream.
 * `unit` = 1% of the stage's shorter side, in dp.
 */
export function PopupArt({ spec, unit }: { spec: PopupDrawSpec; unit: number }) {
  if (spec.kind === 'image') {
    if (!spec.imageUrl) return null
    const h = spec.imageU * unit
    return <Image source={{ uri: spec.imageUrl }} style={{ height: h, aspectRatio: 1 }} resizeMode="contain" accessibilityLabel={spec.text} />
  }

  const font = spec.fontU * unit
  const border = spec.borderColor ? spec.borderEm * font : 0
  const circle = spec.shape === 'circle'
  const radius = circle ? (3.2 * font) / 2 + border : spec.shape === 'pill' ? 999 : 0.28 * font

  return (
    <View style={{ transform: [{ rotate: `${spec.rotDeg}deg` }] }}>
      <View style={[StyleSheet.absoluteFill, { top: 0.18 * font, bottom: -0.18 * font, borderRadius: radius, backgroundColor: 'rgba(0,0,0,0.35)' }]} />
      <View
        style={{
          backgroundColor: spec.bg,
          borderRadius: radius,
          borderWidth: border,
          borderColor: spec.borderColor ?? 'transparent',
          paddingHorizontal: circle ? 0 : 0.8 * font,
          paddingVertical: circle ? 0 : 0.42 * font,
          width: circle ? 3.2 * font + 2 * border : undefined,
          height: circle ? 3.2 * font + 2 * border : undefined,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          numberOfLines={1}
          allowFontScaling={false}
          style={{ fontFamily: DISPLAY_FONT, fontSize: font, lineHeight: font * 1.12, color: spec.fg, letterSpacing: -0.01 * font, includeFontPadding: false }}
        >
          {spec.text}
        </Text>
      </View>
    </View>
  )
}

/** Popups placed on a stage box of `width` × `height` dp, bottom to top. */
export function PopupLayer({ specs, width, height }: { specs: PopupDrawSpec[]; width: number; height: number }) {
  const unit = Math.min(width, height) / 100
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {specs.map((spec) => (
        <View
          key={spec.key}
          style={{
            position: 'absolute',
            left: spec.anchorX * width,
            top: spec.anchorY * height,
            transform: [{ translateX: `${spec.alignX * 100}%` }, { translateY: `${spec.alignY * 100}%` }],
          }}
        >
          <PopupArt spec={spec} unit={unit} />
        </View>
      ))}
    </View>
  )
}
