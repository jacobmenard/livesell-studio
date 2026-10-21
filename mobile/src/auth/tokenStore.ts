import * as SecureStore from 'expo-secure-store'

/**
 * The API token lives in Android's Keystore-backed secure storage, never in plain
 * AsyncStorage, and is removed on log out or when the server rejects it.
 */
const KEY = 'negosyowork.api-token'

export async function readToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY)
  } catch {
    // A Keystore reset (e.g. the phone's lock screen was removed) makes old items unreadable.
    await SecureStore.deleteItemAsync(KEY).catch(() => {})
    return null
  }
}

export async function writeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token)
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => {})
}
