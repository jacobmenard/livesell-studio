import { StyleSheet } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

/**
 * A stand-in picture behind popups where there is no camera (setup cards, the editor
 * preview). The real camera only runs on the live screen.
 */
export function StageBackdrop({ tone = '#24324A' }: { tone?: string }) {
  return (
    <Svg viewBox="0 0 90 160" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill} accessible={false}>
      <Rect width={90} height={160} fill={tone} />
      <Rect y={30} width={90} height={2} fill="#4A5D80" opacity={0.8} />
      <Path d="M4 32h13l2 40H2z" fill="#7A4155" />
      <Path d="M21 32h11l1 32H20z" fill="#C9A35A" />
      <Path d="M58 32h12l2 36H56z" fill="#3F6E6A" />
      <Path d="M74 32h13l2 42H72z" fill="#8A5A3C" />
      <Path d="M8 160c2-30 16-44 37-44s35 14 37 44z" fill="#E8E2D6" />
      <Circle cx={45} cy={92} r={17} fill="#C68E6A" />
      <Path d="M28 92c0-15 7-23 17-23s17 8 17 23c-3-8-9-12-17-12s-14 4-17 12z" fill="#2A1E1A" />
    </Svg>
  )
}

/** The background colour of each built-in backdrop (frontend catalog), for setup cards. */
export const BACKDROP_TONES: Record<string, string> = {
  loft: '#3A3424',
  rack: '#24324A',
  kitchen: '#4A2E24',
  vanity: '#402433',
  brand: '#2B2148',
  white: '#E9E4DA',
}

export function backdropTone(background: Record<string, unknown>): string {
  const preset = typeof background.preset === 'string' ? background.preset : 'rack'
  return BACKDROP_TONES[preset] ?? '#24324A'
}
