import type { ReactNode } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAppUpdate } from '@/hooks/queries'
import { colors, space } from '@/theme'
import { Icon, LogoMark } from './Icon'
import { Button, Notice, Sheet } from './ui'

/**
 * Updates come from the NegosyoWork website as a new APK (no Google Play). The download
 * opens in the phone's browser; Android then installs it over this one, keeping sign-in
 * and saved stream keys, as long as the APK is signed with the same key.
 */
function openDownload(url: string | null | undefined) {
  if (url) void Linking.openURL(url)
}

function WhatsNew({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>What’s new</Text>
      {notes.map((note) => (
        <Text key={note} style={{ color: colors.text2, fontSize: 15, lineHeight: 21 }}>
          • {note}
        </Text>
      ))}
    </View>
  )
}

const INSTALL_HINT =
  'It downloads from the NegosyoWork website. The first time, Android asks to allow installs from your browser — tap Allow. Your setups and stream keys stay.'

/** The "New version ready" sheet (Account → App version, or the banner on My setups). */
export function UpdateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { latest, available } = useAppUpdate()
  if (!latest) return null
  return (
    <Sheet visible={visible} onClose={onClose} title={available ? 'New version ready' : 'You have the newest version'}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={styles.badge}>
          <Icon name="download" size={26} color={colors.link} />
        </View>
        <Text style={{ flex: 1, color: colors.muted, fontSize: 14 }}>
          Version {latest.version_name}
          {latest.size_mb ? ` · ${latest.size_mb} MB` : ''}
        </Text>
      </View>
      {available && (
        <>
          <WhatsNew notes={latest.notes} />
          <Notice>{INSTALL_HINT}</Notice>
          <Button label="Download and install" onPress={() => openDownload(latest.apk_url)} />
          <Button label="Later" variant="ghost" onPress={onClose} />
        </>
      )}
    </Sheet>
  )
}

/**
 * When the server says this version is too old to work (min_version_code), the app shows
 * only the update screen. Decided once per launch from the first answer, so a later
 * re-check can never swap the screen out from under a running live.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const { latest, required } = useAppUpdate({ once: true })
  if (!required || !latest) return <>{children}</>
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: space.xxl, gap: space.xl, justifyContent: 'center' }}>
      <LogoMark size={56} />
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }} accessibilityRole="header">
        Update to keep going live
      </Text>
      <Text style={{ color: colors.text2, fontSize: 16, lineHeight: 23 }}>
        This version of NegosyoWork Studio no longer works with our server. Version {latest.version_name} is ready.
      </Text>
      <WhatsNew notes={latest.notes} />
      <Notice>{INSTALL_HINT}</Notice>
      <Button label="Download and install" onPress={() => openDownload(latest.apk_url)} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  badge: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
})
