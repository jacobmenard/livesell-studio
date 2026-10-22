import { Text, View } from 'react-native'

import type { ForegroundSettings, MediaItem } from '@/api/types'
import { Card, Notice, Segmented } from '@/components/ui'
import { FOREGROUND_DOCKS } from '@/stage/backgrounds'
import { absoluteUrl } from '@/config'
import { foregroundWithDefaults } from '@/stage/stageLook'
import { space } from '@/theme'
import { PictureTile, SectionTitle, styles, SwitchRow, UploadTile, useConfirmRemove, usePictureUpload } from './parts'

export function ForegroundSection({
  foreground: saved,
  media,
  mediaLoading,
  onChange,
}: {
  foreground: ForegroundSettings
  media: MediaItem[]
  mediaLoading: boolean
  onChange: (change: Partial<ForegroundSettings>) => void
}) {
  const foreground = foregroundWithDefaults(saved)
  const images = media.filter((m) => m.kind === 'foreground')
  const pickedId = foreground.media_id && images.some((m) => m.id === foreground.media_id) ? foreground.media_id : null
  const upload = usePictureUpload('foreground', (item) => onChange({ enabled: true, media_id: item.id }))
  // The server turns the foreground off in setups that used it; the unsaved copy does the same.
  const confirmRemove = useConfirmRemove((id) => id === foreground.media_id && onChange({ media_id: null, enabled: false }))

  return (
    <View style={{ padding: space.lg, gap: space.xl }}>
      <View style={{ gap: space.sm }}>
        <Card>
          <SwitchRow
            label="Show a foreground"
            help="A banner over the whole picture: your shop name, a frame, or a sale strip. Popups still show on top."
            value={foreground.enabled}
            onChange={(enabled) => onChange(enabled && !pickedId && images[0] ? { enabled, media_id: images[0].id } : { enabled })}
          />
        </Card>
      </View>

      {foreground.enabled && (
        <>
          <View style={{ gap: space.sm }}>
            <SectionTitle>Where</SectionTitle>
            <Segmented label="Where" value={foreground.dock} onChange={(dock) => onChange({ dock })} options={FOREGROUND_DOCKS} />
            <Text style={styles.help}>TikTok and Facebook show comments near the bottom. Pick Top if they cover your banner.</Text>
          </View>

          <View style={{ gap: space.sm }}>
            <SectionTitle>Image</SectionTitle>
            <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Foreground image">
              {images.map((m) => (
                <PictureTile
                  key={m.id}
                  source={{ uri: absoluteUrl(m.url) ?? undefined }}
                  label={m.label || 'Your foreground'}
                  selected={pickedId === m.id}
                  onPress={() => onChange({ media_id: m.id })}
                  onLongPress={() => confirmRemove(m)}
                  aspect={3}
                  width="48.6%"
                  checker
                />
              ))}
              <UploadTile label="Add a foreground image" busy={upload.busy} onPress={upload.start} aspect={3} width="48.6%" />
            </View>
            <Text style={styles.help}>{mediaLoading ? 'Loading your images…' : 'A wide PNG or GIF with a see-through background works best · 5 MB'}</Text>
            {!pickedId && !mediaLoading && <Notice tone="warning">Pick or add an image — nothing shows until you do.</Notice>}
          </View>
        </>
      )}
    </View>
  )
}
