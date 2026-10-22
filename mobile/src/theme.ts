/**
 * The NegosyoWork Studio dark theme (same tokens as frontend/src/index.css). The app is
 * dark-only: sellers often go live in dim rooms and a bright UI would light their face.
 */
export const colors = {
  bg: '#000000',
  surface: '#1c1c1e',
  surface2: '#2c2c2e',
  raised: '#3a3a3c',
  field: '#111113',
  line: '#38383a',
  lineStrong: '#48484a',
  segmentOn: '#636366',
  text: '#ffffff',
  text2: '#d1d1d6',
  muted: '#98989f',
  link: '#4d9bff',
  tint: 'rgba(77, 155, 255, 0.18)',
  successText: '#27d978',
  successTint: 'rgba(39, 217, 120, 0.16)',
  warning: '#F5C542',
  warningBg: '#3A2E0A',
  dangerText: '#ff6961',
  dangerSolid: '#d92d20',
  // Brand (fixed)
  navy: '#062B63',
  primary: '#0B63CE',
  success: '#27d978',
  ink: '#0D0C10',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tray: 'rgba(12, 12, 14, 0.86)',
} as const

export const radius = { sm: 10, md: 14, lg: 16, xl: 20, sheet: 24, pill: 999 } as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const

/** Popups always use the brand display face (bundled in assets/fonts). */
export const DISPLAY_FONT = 'BricolageGrotesque-ExtraBold'

/** Minimum touch target (Android guidance is 48dp; 44 is the floor used across the design). */
export const TOUCH = 48

export const type = {
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, color: colors.text },
  label: { fontSize: 14, fontWeight: '500', color: colors.text2 },
  small: { fontSize: 13, color: colors.muted },
} as const
