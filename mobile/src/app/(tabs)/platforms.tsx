import * as Clipboard from 'expo-clipboard'
import { useFocusEffect } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useCallback, useState } from 'react'
import { Alert, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import type { Platform } from '@/api/types'
import { Button, Card, Field, Notice } from '@/components/ui'
import { PLATFORM_BY_ID, PLATFORMS, type PlatformInfo } from '@/catalog'
import {
  checkKey,
  checkServer,
  defaultServer,
  keyHint,
  loadAllDestinations,
  readPastedKey,
  removeDestination,
  saveDestination,
  type StreamDestination,
} from '@/stream/streamKeys'
import { colors, radius, space } from '@/theme'
import { readable } from '@/layout/readable'

/** Platforms whose server address never changes (filled in and locked). */
const FIXED_SERVER: Platform[] = ['facebook', 'youtube']

export default function PlatformsScreen() {
  const [saved, setSaved] = useState<Partial<Record<Platform, StreamDestination>>>({})
  const [platform, setPlatform] = useState<Platform>('facebook')
  const [server, setServer] = useState(defaultServer('facebook'))
  const [key, setKey] = useState('')
  const [errors, setErrors] = useState<{ server?: string; key?: string }>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = useCallback((next: Platform, from: Partial<Record<Platform, StreamDestination>>) => {
    setPlatform(next)
    setServer(from[next]?.server ?? defaultServer(next))
    setKey('')
    setErrors({})
    setMessage(null)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadAllDestinations().then((all) => {
        setSaved(all)
        setServer((current) => all[platform]?.server ?? current)
      })
    }, [platform]),
  )

  const fixed = FIXED_SERVER.includes(platform)
  const existing = saved[platform]

  const paste = async (field: 'server' | 'key') => {
    let text = ''
    try {
      text = (await Clipboard.getStringAsync()).trim()
    } catch {
      // Treated like an empty clipboard below.
    }
    if (!text) {
      setErrors((e) => ({ ...e, [field]: 'Nothing copied yet. Copy it on your platform’s page first.' }))
      return
    }
    if (field === 'server') {
      setServer(text)
      setErrors((e) => ({ ...e, server: undefined }))
      return
    }
    const pasted = readPastedKey(text)
    setKey(pasted.key)
    if (pasted.server && !fixed) setServer(pasted.server)
    setErrors((e) => ({ ...e, key: undefined, ...(pasted.server && !fixed ? { server: undefined } : null) }))
  }

  const save = async () => {
    const next = { server: checkServer(server), key: checkKey(key) }
    setErrors(next)
    if (next.server || next.key) return
    setBusy(true)
    try {
      const destination = await saveDestination(platform, server, key)
      setSaved((s) => ({ ...s, [platform]: destination }))
      setKey('')
      setMessage(`Saved. Key ending ${keyHint(destination.key)} is ready for your next live.`)
    } catch {
      setMessage('The key couldn’t be saved on this phone. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const remove = () =>
    Alert.alert(`Remove the ${PLATFORM_BY_ID[platform].label} key?`, 'You can add it again any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          void removeDestination(platform).then(() => {
            setSaved((s) => {
              const copy = { ...s }
              delete copy[platform]
              return copy
            })
            setMessage(null)
          }),
      },
    ])

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView contentContainerStyle={[{ padding: space.xl, gap: 18, paddingBottom: 40 }, readable]} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }} accessibilityRole="header">
              Platforms
            </Text>
            <Text style={{ color: colors.text2, fontSize: 15, lineHeight: 22 }}>Add the stream key for each place you go live. You only do this once.</Text>
          </View>

          <View accessibilityRole="radiogroup" accessibilityLabel="Platform" style={styles.grid}>
            {PLATFORMS.map((p) => {
              const on = p.id === platform
              const has = Boolean(saved[p.id])
              return (
                <Pressable
                  key={p.id}
                  onPress={() => pick(p.id, saved)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[styles.platform, on && styles.platformOn]}
                >
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{p.label}</Text>
                  <Text style={{ color: has ? colors.successText : colors.muted, fontSize: 13 }}>
                    {has ? `Key ending ${keyHint(saved[p.id]!.key)}` : p.id === 'tiktok' ? 'Needs key access' : p.id === 'custom' ? 'Any RTMP server' : 'Not added yet'}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {PLATFORM_BY_ID[platform].keyPage && <KeyGuide page={PLATFORM_BY_ID[platform].keyPage} />}

          <Field
            label="Server URL"
            value={server}
            onChangeText={setServer}
            editable={!fixed}
            action={fixed ? undefined : { label: 'Paste', onPress: () => void paste('server') }}
            error={errors.server}
            help={fixed ? 'Filled in for you.' : 'Paste the server URL your platform shows.'}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Field
            label={existing ? 'New stream key' : 'Stream key'}
            value={key}
            onChangeText={setKey}
            action={{ label: 'Paste', onPress: () => void paste('key') }}
            error={errors.key}
            help={PLATFORM_BY_ID[platform].note}
            secret
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={existing ? `Saved key ends in ${keyHint(existing.key)}` : undefined}
          />

          <Notice tone="success" title="Saved only on this phone">
            Your key is locked in the phone’s secure storage and never sent to our server. You can reset it on {PLATFORM_BY_ID[platform].label === 'Other' ? 'your platform' : PLATFORM_BY_ID[platform].label} any time.
          </Notice>

          {message ? <Notice>{message}</Notice> : null}

          <Button label={existing ? 'Replace key' : 'Save key'} onPress={() => void save()} busy={busy} />
          {existing && <Button label="Remove this key" variant="ghost" onPress={remove} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/** How to copy the key on this phone, with a button to the platform's page. */
function KeyGuide({ page }: { page: NonNullable<PlatformInfo['keyPage']> }) {
  // A Chrome Custom Tab, not Linking: a facebook.com or youtube.com link would open the
  // platform's app, which never shows the stream key.
  const open = () => void WebBrowser.openBrowserAsync(page.url, { toolbarColor: colors.bg, showTitle: true }).catch(() => Linking.openURL(page.url))
  return (
    <Card style={{ padding: space.lg, gap: space.md }}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }} accessibilityRole="header">
        Get your key on this phone
      </Text>
      {page.steps.map((step, i) => (
        <View key={step} style={{ flexDirection: 'row', gap: 10 }}>
          <Text style={styles.stepNumber} accessibilityElementsHidden importantForAccessibility="no">
            {i + 1}
          </Text>
          <Text style={{ flex: 1, color: colors.text2, fontSize: 15, lineHeight: 21 }} accessibilityLabel={`Step ${i + 1}. ${step}`}>
            {step}
          </Text>
        </View>
      ))}
      <Button label={page.label} onPress={open} variant="secondary" size="md" />
    </Card>
  )
}

const styles = StyleSheet.create({
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  platform: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 72,
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  platformOn: { borderColor: colors.link, backgroundColor: 'rgba(77, 155, 255, 0.12)' },
})
