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
import { colors, space } from '@/theme'

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <LogoMark size={36} />
            <Text style={{ color: colors.text, fontSize: 21, fontWeight: '700', letterSpacing: -0.4 }}>
              NegosyoWork <Text style={{ fontWeight: '500', color: colors.muted }}>Studio</Text>
            </Text>
          </View>

          <View style={styles.showcase} accessible={false} importantForAccessibility="no-hide-descendants">
            <StageBackdrop />
            <View style={{ position: 'absolute', top: 18, right: 18 }}>
              <PopupArt spec={showcase('off10')} unit={3.4} />
            </View>
            <View style={{ position: 'absolute', top: 18, left: 16 }}>
              <PopupArt spec={showcase('live')} unit={2.1} />
            </View>
            <View style={{ position: 'absolute', bottom: 14, left: 16 }}>
              <PopupArt spec={showcase('free')} unit={2.6} />
            </View>
          </View>

          <View style={{ gap: space.sm }}>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 }} accessibilityRole="header">
              Sell live with one tap
            </Text>
            <Text style={{ color: colors.text2, fontSize: 16, lineHeight: 23 }}>Popups, effects and sounds on your live, straight from your phone.</Text>
          </View>

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

          <View style={{ gap: space.lg, marginTop: 'auto' }}>
            <Button label="Log in" onPress={() => void submit()} busy={busy} />
            <Text style={{ color: colors.muted, fontSize: 15, textAlign: 'center' }}>
              New here?{' '}
              <Link href="/register" style={{ color: colors.link, fontWeight: '500' }}>
                Create an account
              </Link>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: space.xxl, paddingTop: 32, gap: 26 },
  showcase: { height: 176, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface },
  link: { color: colors.link, fontSize: 15, fontWeight: '500', alignSelf: 'flex-end', paddingVertical: 12 },
})
