import type { ViewStyle } from 'react-native'

/**
 * A centred column for one-column screens on tablets, so lines and fields don't stretch across
 * the whole screen. On phones the screen is narrower than this, so nothing changes.
 */
export const readable: ViewStyle = { width: '100%', maxWidth: 720, alignSelf: 'center' }
/** Forms (log in, sign up, password reset). */
export const readableForm: ViewStyle = { width: '100%', maxWidth: 520, alignSelf: 'center' }
