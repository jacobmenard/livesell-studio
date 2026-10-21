import { router } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { errorMessage } from '@/api/client'
import { authApi } from '@/api/endpoints'
import { Button, Field, Notice, ScreenHeader } from '@/components/ui'
import { colors, space } from '@/theme'

/** Sends the website's reset link by email; the new password then works in the app too. */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email, like you@example.com.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      setDone(await authApi.forgotPassword(email.trim()))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Forgot password" onBack={() => router.back()} />
      <View style={{ flex: 1, padding: space.xl, gap: 18 }}>
        <Text style={{ color: colors.text2, fontSize: 15, lineHeight: 22 }}>
          We’ll email you a link to choose a new password. Open it on this phone or a computer, then log in here.
        </Text>
        {done ? (
          <Notice tone="success" title="Check your email">
            {done}
          </Notice>
        ) : (
          <>
            <Field label="Email" value={email} onChangeText={setEmail} error={error ?? undefined} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Button label="Send reset link" onPress={() => void submit()} busy={busy} />
          </>
        )}
      </View>
    </SafeAreaView>
  )
}
