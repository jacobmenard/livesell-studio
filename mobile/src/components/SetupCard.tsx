import { StyleSheet, Text, View } from 'react-native'

import type { SetupSummary } from '@/api/types'
import { resolveLook } from '@/stage/look'
import { colors, radius, space } from '@/theme'
import { PopupLayer } from './PopupArt'
import { backdropTone, StageBackdrop } from './StageBackdrop'
import { Button, IconButton } from './ui'

function edited(updatedAt: string | null): string {
  if (!updatedAt) return ''
  const then = new Date(updatedAt).getTime()
  const minutes = Math.round((Date.now() - then) / 60_000)
  if (minutes < 1) return 'Edited just now'
  if (minutes < 60) return `Edited ${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Edited ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Edited yesterday'
  if (days < 7) return `Edited ${days} days ago`
  return `Edited ${new Date(updatedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
}

const THUMB_W = 72
const THUMB_H = 128

export function SetupCard({
  setup,
  onGoLive,
  onEdit,
  onMore,
  onUseTemplate,
}: {
  setup: SetupSummary
  onGoLive?: () => void
  onEdit?: () => void
  onMore?: () => void
  onUseTemplate?: () => void
}) {
  const portrait = setup.orientation === 'portrait'
  const stageW = portrait ? THUMB_W : THUMB_W
  const stageH = portrait ? THUMB_H : Math.round((THUMB_W * 9) / 16)
  const specs = setup.scene.popups.map((p) => resolveLook(p))
  const meta = [portrait ? 'Portrait 9:16' : 'Landscape 16:9', setup.background_label].join(' · ')

  return (
    <View style={styles.card}>
      <View style={styles.thumb} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={{ width: stageW, height: stageH, overflow: 'hidden' }}>
          <StageBackdrop tone={backdropTone(setup.scene.background)} />
          <PopupLayer specs={specs} width={stageW} height={stageH} />
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={styles.name} numberOfLines={1}>
          {setup.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        <Text style={styles.meta}>{setup.is_template ? (setup.description ?? 'Starter template') : edited(setup.updated_at)}</Text>
        <View style={{ marginTop: 'auto', flexDirection: 'row', gap: space.sm }}>
          {onUseTemplate ? (
            <Button label="Use template" onPress={onUseTemplate} size="md" style={{ flex: 1 }} />
          ) : (
            <>
              {onGoLive && <Button label="Go live" onPress={onGoLive} variant="danger" dot size="md" style={{ flex: 1 }} accessibilityLabel={`Go live with ${setup.name}`} />}
              {onEdit && <Button label="Edit" onPress={onEdit} variant="secondary" size="md" accessibilityLabel={`Edit ${setup.name}`} />}
              {onMore && <IconButton icon="more" label={`More options for ${setup.name}`} onPress={onMore} />}
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 14, padding: space.md, borderRadius: 18, backgroundColor: colors.surface },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 17, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 13 },
})
