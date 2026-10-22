import * as Battery from 'expo-battery'
import * as Network from 'expo-network'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import type { Platform, Resolution } from '@/api/types'
import { Icon, type IconName } from '@/components/Icon'
import { SetupBackdrop } from '@/components/StageBackdrop'
import { Button, ErrorState, Loading, Notice, ScreenHeader, Segmented } from '@/components/ui'
import { PLATFORMS } from '@/catalog'
import { errorMessage } from '@/api/client'
import { useSetup, useSubscription } from '@/hooks/queries'
import { checkPermissions, openAppSettings, requestPermissions, type PermissionState } from '@/live/permissions'
import { keyHint, loadAllDestinations, type StreamDestination } from '@/stream/streamKeys'
import { colors, radius, space } from '@/theme'

type Facing = 'front' | 'back'

interface Check {
  label: string
  value: string
  tone: 'ok' | 'warn' | 'bad'
}

function CheckRow({ check }: { check: Check }) {
  const icon: IconName = check.tone === 'ok' ? 'check' : 'alert'
  const color = check.tone === 'ok' ? colors.successText : check.tone === 'warn' ? colors.warning : colors.dangerText
  return (
    <View style={styles.checkRow}>
      <Icon name={icon} size={20} color={color} strokeWidth={check.tone === 'ok' ? 2.6 : 2.2} />
      <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>{check.label}</Text>
      <Text style={{ color, fontSize: 14, flexShrink: 1, textAlign: 'right' }}>{check.value}</Text>
    </View>
  )
}

export default function GoLiveCheckScreen() {
  const { setupId } = useLocalSearchParams<{ setupId: string }>()
  const id = Number(setupId)
  const setup = useSetup(id)
  const subscription = useSubscription()

  const [destinations, setDestinations] = useState<Partial<Record<Platform, StreamDestination>>>({})
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [quality, setQuality] = useState<Resolution | null>(null)
  const [facing, setFacing] = useState<Facing>('front')
  const [permissions, setPermissions] = useState<{ camera: PermissionState; mic: PermissionState }>({ camera: 'unknown', mic: 'unknown' })
  const [network, setNetwork] = useState<Network.NetworkState | null>(null)
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null)

  useFocusEffect(
    useCallback(() => {
      void loadAllDestinations().then((all) => {
        setDestinations(all)
        setPlatform((current) => current ?? (PLATFORMS.find((p) => all[p.id])?.id ?? null))
      })
      void checkPermissions().then(setPermissions)
      void Network.getNetworkStateAsync().then(setNetwork).catch(() => {})
      void Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()])
        .then(([level, state]) => setBattery({ level, charging: state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL }))
        .catch(() => {})
    }, []),
  )

  if (setup.isPending) return <Loading />
  if (!setup.data) return <ErrorState message={errorMessage(setup.error, 'This setup couldn’t be opened.')} onRetry={() => void setup.refetch()} />

  const s = setup.data
  const resolution = quality ?? s.resolution
  const plan = subscription.data?.plan
  const noPlan = plan !== undefined && plan.max_live_setups === 0
  const selected = platform ? destinations[platform] : undefined
  const permissionsOk = permissions.camera === 'granted' && permissions.mic === 'granted'

  const checks: Check[] = []
  checks.push(
    permissions.camera === 'granted'
      ? { label: 'Camera', value: 'Ready', tone: 'ok' }
      : { label: 'Camera', value: permissions.camera === 'blocked' ? 'Blocked in settings' : 'Needs permission', tone: 'bad' },
  )
  checks.push(
    permissions.mic === 'granted'
      ? { label: 'Microphone', value: 'Ready', tone: 'ok' }
      : { label: 'Microphone', value: permissions.mic === 'blocked' ? 'Blocked in settings' : 'Needs permission', tone: 'bad' },
  )
  if (network) {
    const online = network.isConnected && network.isInternetReachable !== false
    const kind = network.type === Network.NetworkStateType.WIFI ? 'Wi-Fi' : network.type === Network.NetworkStateType.CELLULAR ? 'Mobile data' : 'Connected'
    checks.push(online ? { label: 'Internet', value: kind, tone: network.type === Network.NetworkStateType.CELLULAR ? 'warn' : 'ok' } : { label: 'Internet', value: 'Offline', tone: 'bad' })
  }
  if (battery && battery.level >= 0) {
    const pct = Math.round(battery.level * 100)
    checks.push(
      battery.charging
        ? { label: `Battery ${pct}%`, value: 'Charging', tone: 'ok' }
        : { label: `Battery ${pct}%`, value: pct < 30 ? 'Plug in before you start' : 'Plug in for long lives', tone: pct < 30 ? 'bad' : 'warn' },
    )
  }

  const online = !network || (network.isConnected && network.isInternetReachable !== false)
  const canStart = Boolean(selected) && permissionsOk && online && !noPlan

  const start = async () => {
    if (!permissionsOk) {
      const result = await requestPermissions()
      setPermissions(result)
      if (result.camera !== 'granted' || result.mic !== 'granted') return
    }
    if (!platform || !selected) return
    router.push({ pathname: '/live/[id]', params: { id: String(id), platform, quality: resolution, facing } })
  }

  const platformLabel = PLATFORMS.find((p) => p.id === platform)?.label ?? 'your platform'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Ready to go live?" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.sm, gap: space.lg }}>
        <View style={styles.summary}>
          <View style={styles.thumb} accessible={false}>
            <SetupBackdrop background={s.scene.background} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
              {s.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {s.orientation === 'portrait' ? 'Portrait 9:16' : 'Landscape 16:9'} · {s.popups.length} popups
            </Text>
          </View>
          <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.link, fontSize: 15, fontWeight: '500' }}>Change</Text>
          </Pressable>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={styles.h2}>Send to</Text>
          <View style={styles.card} accessibilityRole="radiogroup" accessibilityLabel="Send to">
            {PLATFORMS.map((p, i) => {
              const saved = destinations[p.id]
              const on = platform === p.id
              return (
                <Pressable
                  key={p.id}
                  onPress={() => (saved ? setPlatform(p.id) : router.push('/platforms'))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityHint={saved ? undefined : 'Opens Platforms to add a stream key'}
                  style={[styles.option, i > 0 && styles.optionLine]}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                  <Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '500' }}>{p.label}</Text>
                  <Text style={{ color: saved ? colors.muted : colors.link, fontSize: 14, fontWeight: saved ? '400' : '500' }}>
                    {saved ? `Key ending ${keyHint(saved.key)}` : 'Add key'}
                  </Text>
                </Pressable>
              )
            })}
            <View style={[styles.option, styles.optionLine]}>
              <View style={[styles.radio, { opacity: 0.4 }]} />
              <Text style={{ flex: 1, color: colors.muted, fontSize: 16, fontWeight: '500' }}>OBS on this Wi-Fi</Text>
              <Text style={styles.soon}>Coming soon</Text>
            </View>
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={styles.h2}>Video quality</Text>
          <Segmented
            label="Video quality"
            value={resolution}
            onChange={setQuality}
            options={[
              { id: '720p', label: '720p · best for data' },
              { id: '1080p', label: '1080p · sharper' },
            ]}
          />
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={styles.h2}>Camera</Text>
          <Segmented
            label="Camera"
            value={facing}
            onChange={setFacing}
            options={[
              { id: 'front', label: 'Front · selfie' },
              { id: 'back', label: 'Back · sharper' },
            ]}
          />
        </View>

        <View style={[styles.card, { paddingHorizontal: 14, paddingVertical: 4 }]} accessibilityLabel="Checks before going live">
          {checks.map((c) => (
            <CheckRow key={c.label} check={c} />
          ))}
        </View>

        {noPlan && (
          <Notice tone="warning" title={`You're on the ${plan?.name ?? 'free'} plan`}>
            You can set everything up, but going live needs a paid plan. Choose one in Account.
          </Notice>
        )}
        {(permissions.camera === 'blocked' || permissions.mic === 'blocked') && (
          <Notice tone="danger" title="Camera or microphone is blocked">
            Allow both for NegosyoWork Studio in your phone’s settings, then come back.
          </Notice>
        )}
        {(permissions.camera === 'blocked' || permissions.mic === 'blocked') && <Button label="Open settings" variant="secondary" onPress={openAppSettings} />}
        <Notice>Backgrounds and camera looks from the website aren’t used in phone lives yet. Viewers see your real camera with your popups and sounds.</Notice>
      </ScrollView>

      <View style={{ padding: space.xl, paddingTop: space.md, gap: 10 }}>
        {!selected ? (
          <Button label="Add a stream key first" onPress={() => router.push('/platforms')} />
        ) : !permissionsOk ? (
          <Button label="Allow camera and microphone" onPress={() => void start()} />
        ) : (
          <Button label={`Go live on ${platformLabel}`} variant="danger" dot disabled={!canStart} onPress={() => void start()} />
        )}
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>Viewers see your video and popups, never these buttons.</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  h2: { color: colors.text, fontSize: 15, fontWeight: '700' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  thumb: { width: 32, height: 56, borderRadius: 6, overflow: 'hidden' },
  card: { borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: 14 },
  optionLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.link },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.link },
  soon: { color: colors.text2, fontSize: 12, fontWeight: '500', backgroundColor: colors.surface2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  checkRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10 },
})
