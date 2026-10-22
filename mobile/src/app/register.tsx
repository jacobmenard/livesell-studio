import { router } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ApiError, errorMessage } from '@/api/client'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Field, Notice, ScreenHeader } from '@/components/ui'
import { colors, space } from '@/theme'
import { readableForm } from '@/layout/readable'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Errors = { name?: string; email?: string; password?: string; form?: string }

export default function RegisterScreen() {
  const { register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const next: Errors = {}
    if (!name.trim()) next.name = 'Enter your name or your shop’s name.'
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email, like you@example.com.'
    if (password.length < 8) next.password = 'Use at least 8 characters.'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      await register({ name, email, password })
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) setErrors({ name: error.fields.name, email: error.fields.email, password: error.fields.password })
      else setErrors({ form: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Create an account" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView contentContainerStyle={[{ flexGrow: 1, padding: space.xl, gap: 18 }, readableForm]} keyboardShouldPersistTaps="handled">
          <Text style={{ color: colors.text2, fontSize: 15, lineHeight: 22 }}>
            Your first week is free: set up your popups and sounds, then choose a plan to go live.
          </Text>
          <Field label="Your name or shop name" value={name} onChangeText={setName} error={errors.name} autoComplete="name" maxLength={80} />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            help="At least 8 characters."
            secret
            autoComplete="new-password"
            onSubmitEditing={() => void submit()}
          />
          {errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}
          <View style={{ marginTop: 'auto' }}>
            <Button label="Create account" onPress={() => void submit()} busy={busy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
