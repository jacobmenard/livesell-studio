import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { accountApi } from '@/api/endpoints'
import { useAuth } from '@/auth/AuthProvider'
import { UpdateSheet } from '@/components/UpdateSheet'
import { Button, Card, Row } from '@/components/ui'
import { API_URL, appVersionName } from '@/config'
import { useAppUpdate, useSubscription } from '@/hooks/queries'
import { colors, radius, space } from '@/theme'
import { readable } from '@/layout/readable'

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

function day(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : null
}

/**
 * Opens a page of the web app. The server names its address (in production its own subdomain,
 * not the API's); until it has answered, the API's address is used, as when both share a domain.
 */
const openWeb = (webUrl: string | null | undefined, path: string) => void Linking.openURL(`${webUrl || API_URL}${path}`)

export default function AccountScreen() {
  const { user, logout } = useAuth()
  const subscription = useSubscription()
  const update = useAppUpdate()
  const [updateOpen, setUpdateOpen] = useState(false)
  /** The page whose sign-in link is being fetched. */
  const [opening, setOpening] = useState<string | null>(null)

  /** Opens a page of the website signed in as this account (no second login); the plain page if that fails. */
  const openSignedIn = async (path: string) => {
    if (opening) return
    setOpening(path)
    try {
      const { url } = await accountApi.webLink(path)
      await Linking.openURL(url)
    } catch {
      openWeb(update.latest?.web_url, path)
    } finally {
      setOpening(null)
    }
  }

  // Plans are paid on the website (GCash, Maya or bank, checked by the NegosyoWork team).
  const openPlans = () => void openSignedIn('/plans')

  const plan = subscription.data?.plan
  const until = day(subscription.data?.ends_at ?? null)
  const trialUntil = day(subscription.data?.trial_ends_at ?? null)
  const price = plan && plan.price_monthly > 0 ? `${plan.currency === 'PHP' ? '₱' : `${plan.currency} `}${plan.price_monthly.toLocaleString('en-PH')}` : null

  const confirmLogout = () =>
    Alert.alert('Log out of this phone?', 'Your saved stream keys stay on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() },
    ])

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={[{ padding: space.xl, gap: space.lg, paddingBottom: 40 }, readable]}>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }} accessibilityRole="header">
          Account
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={styles.avatar} accessible={false}>
            <Text style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>{initials(user?.account_name ?? user?.name ?? '')}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }} numberOfLines={1}>
              {user?.is_subuser ? `${user.name} · ${user.account_name}` : (user?.name ?? '')}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14 }} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>

        <View style={styles.plan}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
            <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700' }}>{plan?.name ?? (subscription.isPending ? 'Loading plan…' : 'Plan')}</Text>
            {price && (
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '500' }}>
                <Text style={{ fontSize: 22, fontWeight: '700' }}>{price}</Text> / month
              </Text>
            )}
          </View>
          <Text style={{ color: colors.text2, fontSize: 14 }}>
            {trialUntil ? `Free week until ${trialUntil}` : until ? `Paid until ${until}` : plan && plan.max_live_setups === 0 ? 'Set up everything; going live needs a plan.' : ' '}
          </Text>
          {!user?.is_subuser && (
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 4 }}>
              <Button label="Change plan" variant="onBrand" size="md" busy={opening === '/plans'} onPress={openPlans} style={{ flex: 1 }} />
              <Button label="Pay or renew" size="md" busy={opening === '/plans'} onPress={openPlans} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.14)' }} />
            </View>
          )}
        </View>

        <Card>
          <Row label="Platforms and stream keys" onPress={() => router.push('/platforms')} />
          <Row label="Help and guide" onPress={() => void openSignedIn('/setups')} />
          <Row
            label={`App version ${appVersionName()}`}
            value={update.available ? 'Update ready' : 'Up to date'}
            valueTone={update.available ? 'link' : 'muted'}
            onPress={() => setUpdateOpen(true)}
          />
          <Row label="Log out" danger last onPress={confirmLogout} />
        </Card>
      </ScrollView>
      <UpdateSheet visible={updateOpen} onClose={() => setUpdateOpen(false)} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  plan: { padding: 18, borderRadius: radius.xl, backgroundColor: colors.navy, gap: 10 },
})
