import { Pressable, Text, View } from 'react-native'

import type { BackgroundSettings, MediaItem } from '@/api/types'
import { Notice } from '@/components/ui'
import { BACKGROUND_MODES, BACKGROUND_PRESETS, KEY_COLORS } from '@/stage/backgrounds'
import { backgroundWithDefaults } from '@/stage/stageLook'
import { colors, radius, space } from '@/theme'
import { LookSlider, PictureTile, SectionTitle, styles, UploadTile, useConfirmRemove, usePictureUpload } from './parts'

export function BackgroundSection({
  background: saved,
  media,
  mediaLoading,
  segmentationMissing,
  onChange,
}: {
  background: BackgroundSettings
  /** The seller's uploaded pictures (all kinds). */
  media: MediaItem[]
  mediaLoading: boolean
  /** This phone can't find the person (Blur and Picture need it). */
  segmentationMissing: boolean
  onChange: (change: Partial<BackgroundSettings>) => void
}) {
  const background = backgroundWithDefaults(saved)
  const photos = media.filter((m) => m.kind === 'background')
  // A deleted photo shows as the built-in picture, like the live does.
  const photoId = background.media_id && photos.some((p) => p.id === background.media_id) ? background.media_id : null
  const upload = usePictureUpload('background', (item) => onChange({ media_id: item.id }))
  const confirmRemove = useConfirmRemove((id) => id === background.media_id && onChange({ media_id: null }))
  const mode = BACKGROUND_MODES.find((m) => m.id === background.mode) ?? BACKGROUND_MODES[0]!
  const showsPicture = background.mode === 'image' || background.mode === 'green'

  return (
    <View style={{ padding: space.lg, gap: space.xl }}>
      <View style={{ gap: space.sm }}>
        <SectionTitle>Behind you</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Background">
          {BACKGROUND_MODES.map((m) => {
            const on = m.id === background.mode
            return (
              <Pressable
                key={m.id}
                onPress={() => onChange({ mode: m.id })}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={{
                  width: '48.6%',
                  minHeight: 52,
                  borderRadius: radius.md,
                  borderWidth: 2,
                  borderColor: on ? colors.link : 'transparent',
                  backgroundColor: on ? colors.tint : colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: on ? '700' : '500' }}>{m.label}</Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={styles.help}>{mode.help}</Text>
        {segmentationMissing && (background.mode === 'blur' || background.mode === 'image') && (
          <Notice tone="warning" title="This phone can’t do it">
            This phone can’t pick you out from the room, so {background.mode === 'blur' ? 'the blur' : 'the picture'} won’t show in your live. Green screen still works.
          </Notice>
        )}
      </View>

      {showsPicture && (
        <View style={{ gap: space.sm }}>
          <SectionTitle>Picture</SectionTitle>
          <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Picture">
            {BACKGROUND_PRESETS.map((p) => (
              <PictureTile key={p.id} source={p.thumb} label={p.label} selected={!photoId && background.preset === p.id} onPress={() => onChange({ preset: p.id, media_id: null })} />
            ))}
            {photos.map((p) => (
              <PictureTile
                key={p.id}
                source={{ uri: p.url }}
                label={p.label || 'Your photo'}
                selected={photoId === p.id}
                onPress={() => onChange({ media_id: p.id })}
                onLongPress={() => confirmRemove(p)}
              />
            ))}
            <UploadTile label="Add your own background photo" busy={upload.busy} onPress={upload.start} />
          </View>
          <Text style={styles.help}>{mediaLoading ? 'Loading your photos…' : 'Your own photo: PNG, JPG, WEBP or GIF, up to 5 MB. Long-press one of yours to delete it.'}</Text>
        </View>
      )}

      {background.mode === 'green' && (
        <View style={{ gap: space.md }}>
          <SectionTitle>Cloth colour</SectionTitle>
          <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Cloth colour">
            {KEY_COLORS.map((k) => {
              const on = k.id === background.key_color
              return (
                <Pressable
                  key={k.id}
                  onPress={() => onChange({ key_color: k.id })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[styles.chip, { flexDirection: 'row', gap: space.sm, flex: 1 }, on && styles.chipOn]}
                >
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: k.swatch, borderWidth: 2, borderColor: '#FFFFFF' }} />
                  <Text style={styles.chipText}>{k.label}</Text>
                </Pressable>
              )
            })}
          </View>
          <LookSlider
            label="Similarity"
            value={background.similarity}
            onChange={(similarity) => onChange({ similarity })}
            low="Only the exact colour"
            high="Close colours too"
            hint="Raise it if bits of cloth still show. Lower it if parts of you disappear."
          />
          <LookSlider label="Edge smoothness" value={background.smoothness} onChange={(smoothness) => onChange({ smoothness })} low="Sharp" high="Soft" />
        </View>
      )}
    </View>
  )
}
