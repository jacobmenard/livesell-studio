import { router, useLocalSearchParams } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import type { Platform } from '@/api/types'
import { Icon } from '@/components/Icon'
import { Button, Notice } from '@/components/ui'
import { PLATFORM_BY_ID } from '@/catalog'
import { duration } from '@/live/format'
import { colors, radius, space } from '@/theme'

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <View style={styles.stat}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: tone === 'good' ? colors.successText : colors.text, fontSize: 24, fontWeight: '700' }}>{value}</Text>
    </View>
  )
}

export default function LiveEndedScreen() {
  const p = useLocalSearchParams<{ name: string; platform: Platform; seconds: string; popups: string; sounds: string; drops: string; setupId: string }>()
  const platform = PLATFORM_BY_ID[p.platform]?.label ?? 'your platform'
  const drops = Number(p.drops) || 0

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, padding: space.xl, paddingTop: 48, gap: 22 }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <View style={styles.icon}>
            <Icon name="check" size={34} color={colors.successText} strokeWidth={2.6} />
          </View>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700' }} accessibilityRole="header">
            Live ended
          </Text>
          <Text style={{ color: colors.text2, fontSize: 15 }}>
            {p.name ? `${p.name} · ` : ''}
            {platform}
          </Text>
        </View>

        <View style={styles.grid}>
          <Stat label="How long" value={duration(Number(p.seconds) || 0)} />
          <Stat label="Connection" value={drops === 0 ? 'Stable' : `${drops} ${drops === 1 ? 'drop' : 'drops'}`} tone={drops === 0 ? 'good' : undefined} />
          <Stat label="Popups shown" value={String(Number(p.popups) || 0)} />
          <Stat label="Sounds played" value={String(Number(p.sounds) || 0)} />
        </View>

        {drops > 0 && <Notice tone="warning">The signal dropped during this live. A steadier Wi-Fi spot, or plugging in a router nearby, helps next time.</Notice>}

        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>Your recording, viewers and comments are in {platform}.</Text>

        <View style={{ marginTop: 'auto', gap: 10 }}>
          <Button label="Back to my setups" onPress={() => router.dismissTo('/')} />
          <Button
            label="Go live again"
            variant="secondary"
            onPress={() => router.replace({ pathname: '/live/check', params: { setupId: p.setupId } })}
          />
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  icon: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.successTint, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '47%', flexGrow: 1, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, gap: 4 },
})
