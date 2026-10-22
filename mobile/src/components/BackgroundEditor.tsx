import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native'

import type { BackgroundSettings, ForegroundSettings, MediaItem } from '@/api/types'
import { Icon } from '@/components/Icon'
import { Button, Card, Notice, Segmented } from '@/components/ui'
import { absoluteUrl } from '@/config'
import {
  BACKGROUND_MODES,
  BACKGROUND_PRESETS,
  DOCKS,
  KEY_COLORS,
  modeInfo,
  nearestLevel,
  pickedMedia,
  showsPicture,
  SIMILARITY_LEVELS,
  SMOOTHNESS_LEVELS,
} from '@/stage/background'
import { colors, radius, space } from '@/theme'

type Upload = 'background' | 'foreground'

interface LibraryProps {
  /** The account's uploads; undefined while loading. */
  media: MediaItem[] | undefined
  mediaError: string | null
  /** Which kind is uploading right now, if any. */
  uploading: Upload | null
  onUpload: (kind: Upload) => void
  onRemove: (item: MediaItem) => Promise<void>
}

/** The setup's background, as on the website's Background panel. */
export function BackgroundSection({
  background,
  onChange,
  ...library
}: { background: BackgroundSettings; onChange: (patch: Partial<BackgroundSettings>) => void } & LibraryProps) {
  const mode = modeInfo(background.mode)
  const own = (library.media ?? []).filter((m) => m.kind === 'background')
  // A deleted photo falls back to the preset, like the server does.
  const ownPicked = pickedMedia(library.media, background.media_id, 'background')

  return (
    <View style={{ gap: space.md }}>
      <Text style={styles.h2}>Background</Text>
      <Segmented
        label="Background mode"
        value={background.mode}
        onChange={(m) => onChange({ mode: m })}
        options={BACKGROUND_MODES.map((m) => ({ id: m.id, label: m.id === 'green' ? 'Green' : m.label }))}
      />
      <Text style={styles.help}>{mode.help}</Text>

      {background.mode !== 'none' && (
        <Notice title="Shows on your clean screen">
          Your background shows on the website’s clean screen (OBS and TikTok LIVE Studio). Going live from this phone uses your real camera picture for now.
        </Notice>
      )}

      {showsPicture(background) && (
        <View style={styles.grid}>
          {BACKGROUND_PRESETS.map((p) => (
            <Tile
              key={p.id}
              label={p.label}
              tone={p.tone}
              on={!ownPicked && background.preset === p.id}
              onPress={() => onChange({ preset: p.id, media_id: null })}
            />
          ))}
          {own.map((m) => (
            <Tile
              key={m.id}
              label={m.label}
              tone="#17151C"
              imageUrl={absoluteUrl(m.url)}
              on={ownPicked?.id === m.id}
              onPress={() => onChange({ media_id: m.id })}
              onRemove={() => confirmRemove(m, 'Setups using it go back to a built-in background.', library.onRemove)}
            />
          ))}
          <UploadTile label="Upload photo" busy={library.uploading === 'background'} disabled={library.uploading !== null} onPress={() => library.onUpload('background')} />
        </View>
      )}
      {showsPicture(background) && <Text style={styles.help}>PNG, JPG, WEBP or GIF, up to 5 MB.</Text>}
      <LibraryState media={library.media} error={library.mediaError} />

      {background.mode === 'green' && (
        <Card style={{ padding: 14, gap: space.md }}>
          <View style={{ gap: space.sm }}>
            <Text style={styles.label}>Screen colour behind you</Text>
            <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Screen colour">
              {KEY_COLORS.map((k) => {
                const on = background.key_color === k.id
                return (
                  <Pressable
                    key={k.id}
                    onPress={() => onChange({ key_color: k.id })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.chip, on && { borderColor: colors.link }]}
                  >
                    <View style={[styles.chipSwatch, { backgroundColor: k.swatch }]} />
                    <Text style={styles.chipText}>{k.label}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
          <View style={{ gap: space.sm }}>
            <Text style={styles.label}>Similarity</Text>
            <Segmented
              label="Similarity"
              value={nearestLevel(SIMILARITY_LEVELS, background.similarity)}
              onChange={(v) => onChange({ similarity: Number(v) })}
              options={SIMILARITY_LEVELS.map((l) => ({ id: l.id, label: l.label }))}
            />
            <Text style={styles.help}>Higher removes more of the screen colour; too high can eat into your clothes.</Text>
          </View>
          <View style={{ gap: space.sm }}>
            <Text style={styles.label}>Edge smoothness</Text>
            <Segmented
              label="Edge smoothness"
              value={nearestLevel(SMOOTHNESS_LEVELS, background.smoothness)}
              onChange={(v) => onChange({ smoothness: Number(v) })}
              options={SMOOTHNESS_LEVELS.map((l) => ({ id: l.id, label: l.label }))}
            />
          </View>
        </Card>
      )}
    </View>
  )
}

/** The setup's foreground image, as on the website's Foreground panel. */
export function ForegroundSection({
  foreground,
  onChange,
  ...library
}: { foreground: ForegroundSettings; onChange: (patch: Partial<ForegroundSettings>) => void } & LibraryProps) {
  const images = (library.media ?? []).filter((m) => m.kind === 'foreground')
  const picked = pickedMedia(library.media, foreground.media_id, 'foreground')

  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: 4 }}>
        <Text style={styles.h2}>Foreground image</Text>
        <Text style={styles.help}>An image across the full width, docked to the top or bottom, in portrait and landscape. It has its own images, separate from popup images.</Text>
      </View>

      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Show the foreground on your live</Text>
            <Text style={styles.help}>{picked ? 'Popups still show on top of it.' : 'Upload or pick a foreground image below first.'}</Text>
          </View>
          <Switch
            value={foreground.enabled && picked !== null}
            disabled={!picked}
            onValueChange={(enabled) => onChange({ enabled })}
            trackColor={{ true: colors.success, false: colors.raised }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Show the foreground on your live"
          />
        </View>
      </Card>

      <View style={{ gap: space.sm }}>
        <Text style={styles.label}>Dock it to the</Text>
        <Segmented label="Dock the foreground to" value={foreground.dock} onChange={(dock) => onChange({ dock })} options={DOCKS} />
      </View>

      <View style={styles.grid}>
        {images.map((m) => (
          <Tile
            key={m.id}
            wide
            label={m.label}
            tone={colors.surface2}
            imageUrl={absoluteUrl(m.url)}
            contain
            on={picked?.id === m.id}
            // Picking an image shows it straight away, as on the website.
            onPress={() => onChange({ media_id: m.id, enabled: true })}
            onRemove={() => confirmRemove(m, 'Setups showing it turn their foreground off.', library.onRemove)}
          />
        ))}
        <UploadTile wide label="Upload foreground" busy={library.uploading === 'foreground'} disabled={library.uploading !== null} onPress={() => library.onUpload('foreground')} />
      </View>
      <Text style={styles.help}>A wide PNG or GIF with a see-through background works best · 5 MB.</Text>
      <LibraryState media={library.media} error={library.mediaError} />

      {picked && <Button label="Remove foreground" variant="ghost" size="md" onPress={() => onChange({ media_id: null, enabled: false })} />}
    </View>
  )
}

function confirmRemove(item: MediaItem, consequence: string, onRemove: (item: MediaItem) => Promise<void>) {
  Alert.alert('Delete this picture?', `“${item.label}” is deleted from your account. ${consequence}`, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void onRemove(item) },
  ])
}

function LibraryState({ media, error }: { media: MediaItem[] | undefined; error: string | null }) {
  if (error) return <Notice tone="danger">{error}</Notice>
  if (!media) return <Text style={styles.help}>Loading your pictures…</Text>
  return null
}

function Tile({
  label,
  tone,
  imageUrl,
  on,
  onPress,
  onRemove,
  wide = false,
  contain = false,
}: {
  label: string
  tone: string
  imageUrl?: string | null
  on: boolean
  onPress: () => void
  onRemove?: () => void
  wide?: boolean
  contain?: boolean
}) {
  return (
    <View style={[wide ? styles.wideTile : styles.tile]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        style={[styles.tileButton, on && { borderColor: colors.link }]}
      >
        <View style={[styles.thumb, { backgroundColor: tone, aspectRatio: wide ? 16 / 7 : 16 / 10 }]}>
          {imageUrl && <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode={contain ? 'contain' : 'cover'} accessible={false} />}
        </View>
        <Text style={styles.tileLabel} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      {on && (
        <View style={styles.check} pointerEvents="none">
          <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3.4} />
        </View>
      )}
      {onRemove && (
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Delete ${label}`} hitSlop={8} style={styles.remove}>
          <Icon name="close" size={13} color="#FFFFFF" strokeWidth={3} />
        </Pressable>
      )}
    </View>
  )
}

function UploadTile({ label, busy, disabled, onPress, wide = false }: { label: string; busy: boolean; disabled: boolean; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      style={[wide ? styles.wideTile : styles.tile, styles.upload, disabled && !busy && { opacity: 0.5 }]}
    >
      {busy ? <ActivityIndicator color={colors.link} /> : <Icon name="plus" size={22} color={colors.link} />}
      <Text style={[styles.tileLabel, { color: colors.link, textAlign: 'center' }]}>{busy ? 'Uploading…' : label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  h2: { color: colors.text, fontSize: 15, fontWeight: '700' },
  label: { color: colors.text2, fontSize: 14, fontWeight: '500' },
  help: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '31.6%' },
  wideTile: { width: '48.5%' },
  tileButton: { borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', padding: 4, gap: 4 },
  thumb: { width: '100%', borderRadius: 8, overflow: 'hidden' },
  tileLabel: { color: colors.text, fontSize: 12, paddingHorizontal: 2 },
  check: { position: 'absolute', top: 9, left: 9, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  upload: {
    minHeight: 92,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: space.sm,
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 2, borderColor: colors.lineStrong },
  chipSwatch: { width: 14, height: 14, borderRadius: 4 },
  chipText: { color: colors.text, fontSize: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 14, minHeight: 64 },
  switchLabel: { color: colors.text, fontSize: 16, fontWeight: '500' },
})
