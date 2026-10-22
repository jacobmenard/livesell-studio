import Slider from '@react-native-community/slider'
import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native'

import { errorMessage } from '@/api/client'
import type { MediaItem, MediaKind } from '@/api/types'
import { Icon } from '@/components/Icon'
import { Picture, type PictureSource } from '@/components/Picture'
import { Notice } from '@/components/ui'
import { useRemoveMedia, useUploadMedia } from '@/hooks/queries'
import { pickPicture, prepareUpload } from '@/media/pickImage'
import { colors, radius, space } from '@/theme'

/** A 0–100 slider with its name, current value and what each end does. */
export function LookSlider({
  label,
  value,
  onChange,
  low,
  high,
  hint,
  min = 0,
  max = 100,
  format,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  low: string
  high: string
  hint?: string
  min?: number
  max?: number
  format?: (v: number) => string
}) {
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.sliderHead}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{format ? format(value) : String(value)}</Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={1}
        onValueChange={(v) => onChange(Math.round(v))}
        minimumTrackTintColor={colors.link}
        maximumTrackTintColor={colors.raised}
        thumbTintColor="#FFFFFF"
        style={{ height: 40, marginHorizontal: -8 }}
        accessibilityLabel={label}
        accessibilityHint={`${low} to ${high}`}
      />
      <View style={styles.sliderEnds}>
        <Text style={styles.end}>{low}</Text>
        <Text style={styles.end}>{high}</Text>
      </View>
      {hint && <Text style={[styles.help, { marginTop: 4 }]}>{hint}</Text>}
    </View>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={styles.h2}>{children}</Text>
      {right}
    </View>
  )
}

export function SwitchRow({ label, help, value, onChange }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.switchLabel}>{label}</Text>
        {help && <Text style={styles.help}>{help}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.success, false: colors.raised }} thumbColor="#FFFFFF" accessibilityLabel={label} />
    </View>
  )
}

/** A picture to pick (built-in backdrop or the seller's upload). */
export function PictureTile({
  source,
  label,
  selected,
  onPress,
  onLongPress,
  aspect = 16 / 9,
  width = '31.6%',
  checker = false,
}: {
  source: PictureSource
  label: string
  selected: boolean
  onPress: () => void
  onLongPress?: () => void
  aspect?: number
  width?: `${number}%`
  /** A see-through pattern behind the picture (foregrounds). */
  checker?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      accessibilityHint={onLongPress ? 'Long-press to delete' : undefined}
      style={[styles.tile, { aspectRatio: aspect, width }, selected && { borderColor: colors.link }]}
    >
      {checker && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface2 }]} />}
      <Picture source={source} style={StyleSheet.absoluteFill} fit={checker ? 'contain' : 'cover'} accessible={false} />
      {selected && (
        <View style={styles.check}>
          <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3.4} />
        </View>
      )}
    </Pressable>
  )
}

/** The seller's pictures couldn't be fetched: says so (an empty list would look like "none uploaded"). */
export function MediaError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ gap: space.xs }}>
      <Notice tone="danger" title="Couldn’t load your pictures">
        {message}
      </Notice>
      <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <Text style={{ color: colors.link, fontSize: 14, fontWeight: '600' }}>Try again</Text>
      </Pressable>
    </View>
  )
}

export function UploadTile({ label, busy, onPress, aspect = 16 / 9, width = '31.6%' }: { label: string; busy: boolean; onPress: () => void; aspect?: number; width?: `${number}%` }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      style={[styles.tile, styles.upload, { aspectRatio: aspect, width }]}
    >
      {busy ? <ActivityIndicator color={colors.link} /> : <Icon name="plus" size={22} color={colors.link} />}
      <Text style={{ color: colors.link, fontSize: 12, fontWeight: '600' }}>{busy ? 'Uploading…' : 'Add photo'}</Text>
    </Pressable>
  )
}

/** Picks a picture from the phone and uploads it to the seller's media. */
export function usePictureUpload(kind: Exclude<MediaKind, 'sound'>, onUploaded: (item: MediaItem) => void) {
  const upload = useUploadMedia()
  const [picking, setPicking] = useState(false)

  const start = async () => {
    setPicking(true)
    try {
      const asset = await pickPicture()
      if (!asset) return
      const prepared = prepareUpload(kind, asset)
      if ('error' in prepared) {
        Alert.alert('Can’t use that picture', prepared.error)
        return
      }
      const item = await upload.mutateAsync({ kind, file: prepared.file })
      onUploaded(item)
    } catch (error) {
      Alert.alert('Upload failed', errorMessage(error, 'Check your internet and try again.'))
    } finally {
      setPicking(false)
    }
  }

  return { start: () => void start(), busy: picking || upload.isPending }
}

/** Asks, then deletes one of the seller's pictures. */
export function useConfirmRemove(onRemoved: (id: number) => void) {
  const remove = useRemoveMedia()
  return (item: MediaItem) =>
    Alert.alert('Delete this picture?', 'It is removed from every setup that uses it. Setups showing it fall back to a built-in picture.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(item.id, {
            onSuccess: () => onRemoved(item.id),
            onError: (error) => Alert.alert('Not deleted', errorMessage(error)),
          }),
      },
    ])
}

export const styles = StyleSheet.create({
  h2: { color: colors.text, fontSize: 15, fontWeight: '700' },
  help: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  label: { color: colors.text, fontSize: 15, fontWeight: '500' },
  value: { color: colors.muted, fontSize: 14, fontVariant: ['tabular-nums'] },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sliderEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  end: { color: colors.muted, fontSize: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 14, minHeight: 64 },
  switchLabel: { color: colors.text, fontSize: 16, fontWeight: '500' },
  // Not stretched to the row's height: that overrides a tile's aspectRatio, and a row of
  // pictures only (no text to give it height) collapses them to their 2 px borders.
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: space.sm },
  tile: { width: '31.6%', alignSelf: 'flex-start', borderRadius: radius.sm, borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.surface, overflow: 'hidden' },
  upload: { alignItems: 'center', justifyContent: 'center', gap: 2, borderStyle: 'dashed', borderColor: colors.lineStrong },
  check: { position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
})
