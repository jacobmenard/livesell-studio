import { Link } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ApiError, errorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthProvider'
import { LogoMark } from '@/components/Icon'
import { PopupArt } from '@/components/PopupArt'
import { StageBackdrop } from '@/components/StageBackdrop'
import { Button, Field, Notice } from '@/components/ui'
import { PRESET_BY_ID } from '@/catalog'
import { resolveLook } from '@/stage/look'
import { useDeviceLayout } from '@/layout/device'
import { colors, radius, space } from '@/theme'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function showcase(key: 'off10' | 'live' | 'free') {
  const preset = PRESET_BY_ID[key]
  return resolveLook({
    key,
    kind: 'preset',
    preset_key: key,
    label: null,
    text: null,
    color: null,
    media_id: null,
    position: preset.position,
    x: null,
    y: null,
    size: 100,
    entrance: 'none',
    effect: 'none',
    effect_repeat: 'once',
  })
}

export default function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const layout = useDeviceLayout()

  const submit = async () => {
    const next: typeof errors = {}
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email, like you@example.com.'
    if (!password) next.password = 'Enter your password.'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      await login(email, password)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) setErrors({ email: error.fields.email ?? error.message })
      else setErrors({ form: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  const brand = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <LogoMark size={layout.tablet ? 40 : 36} />
      <Text style={{ color: colors.text, fontSize: layout.tablet ? 24 : 21, fontWeight: '700', letterSpacing: -0.4 }}>
        NegosyoWork <Text style={{ fontWeight: '500', color: colors.muted }}>Studio</Text>
      </Text>
    </View>
  )

  // The popups grow with the picture (they're sized for the phone's 176 dp tall one).
  const unit = layout.tablet ? 1.7 : 1
  const picture = (
    <View
      style={[styles.showcase, layout.wide && layout.tablet ? { flex: 1, height: undefined, borderRadius: radius.sheet } : layout.tablet && { height: 300 }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <StageBackdrop />
      <View style={{ position: 'absolute', top: 18, right: 18 }}>
        <PopupArt spec={showcase('off10')} unit={3.4 * unit} />
      </View>
      <View style={{ position: 'absolute', top: 18, left: 16 }}>
        <PopupArt spec={showcase('live')} unit={2.1 * unit} />
      </View>
      <View style={{ position: 'absolute', bottom: 14, left: 16 }}>
        <PopupArt spec={showcase('free')} unit={2.6 * unit} />
      </View>
    </View>
  )

  const headline = (
    <View style={{ gap: space.sm }}>
      <Text style={{ color: colors.text, fontSize: layout.tablet ? 36 : 30, fontWeight: '700', letterSpacing: -0.5 }} accessibilityRole="header">
        Sell live with one tap
      </Text>
      <Text style={{ color: colors.text2, fontSize: layout.tablet ? 18 : 16, lineHeight: layout.tablet ? 26 : 23 }}>
        Popups, effects and sounds on your live, straight from your {layout.tablet ? 'tablet' : 'phone'}.
      </Text>
    </View>
  )

  const form = (
    <>
      <View style={{ gap: 14 }}>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secret
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <Link href="/forgot-password" style={styles.link}>
          Forgot password?
        </Link>
      </View>

      {errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}

      <View style={{ gap: space.lg, marginTop: layout.tablet ? 0 : 'auto' }}>
        <Button label="Log in" onPress={() => void submit()} busy={busy} />
        <Text style={{ color: colors.muted, fontSize: 15, textAlign: 'center' }}>
          New here?{' '}
          <Link href="/register" style={{ color: colors.link, fontWeight: '500' }}>
            Create an account
          </Link>
        </Text>
      </View>
    </>
  )

  // Tablet held sideways: the picture on the left, the form on the right.
  if (layout.tablet && layout.wide) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, flexDirection: 'row' }}>
        <View style={{ flex: 1, padding: 40, gap: 28 }}>
          {brand}
          {picture}
          {headline}
        </View>
        <KeyboardAvoidingView style={styles.formSide} behavior="height">
          <ScrollView contentContainerStyle={styles.formSideScroll} keyboardShouldPersistTaps="handled">
            <View style={{ width: 400, gap: 24 }}>
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 }}>Log in</Text>
                <Text style={{ color: colors.muted, fontSize: 15 }}>Use the same account as the website.</Text>
              </View>
              {form}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView
          contentContainerStyle={[styles.page, layout.tablet && styles.pageTablet]}
          keyboardShouldPersistTaps="handled"
        >
          {brand}
          {picture}
          {headline}
          {form}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: space.xxl, paddingTop: 32, gap: 26 },
  showcase: { height: 176, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface },
  // Upright tablet: one centred column, not stretched across the screen.
  pageTablet: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingTop: 56, justifyContent: 'center' },
  formSide: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.surface },
  formSideScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  link: { color: colors.link, fontSize: 15, fontWeight: '500', alignSelf: 'flex-end', paddingVertical: 12 },
})
