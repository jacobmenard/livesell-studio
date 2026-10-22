import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DarkTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { UpdateGate } from '@/components/UpdateSheet'
import { colors } from '@/theme'

void SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
})

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, border: colors.line, primary: colors.link, text: colors.text },
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemeProvider value={theme}>
            <StatusBar style="light" />
            <RootStack />
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}

function RootStack() {
  const { status } = useAuth()

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync()
  }, [status])

  if (status === 'loading') return null

  return (
    <UpdateGate>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="setup/[id]" />
          <Stack.Screen name="live/check" />
          {/* The live screen manages leaving itself (it asks before ending the live). */}
          <Stack.Screen name="live/[id]" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="live/ended" options={{ animation: 'fade', gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>
      </Stack>
    </UpdateGate>
  )
}
