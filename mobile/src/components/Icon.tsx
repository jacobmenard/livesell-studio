import type { ColorValue } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

import { colors } from '@/theme'

export type IconName =
  | 'back'
  | 'chevron'
  | 'plus'
  | 'more'
  | 'grid'
  | 'broadcast'
  | 'user'
  | 'flip'
  | 'mic'
  | 'micOff'
  | 'sparkle'
  | 'volume'
  | 'eyeOff'
  | 'check'
  | 'lock'
  | 'wifi'
  | 'wifiOff'
  | 'battery'
  | 'alert'
  | 'refresh'
  | 'close'
  | 'download'
  | 'search'
  | 'info'

/** Stroke icons from the design (24px grid). Always decorative: give the button a label. */
export function Icon({ name, size = 24, color = colors.text, strokeWidth = 2 }: { name: IconName; size?: number; color?: ColorValue; strokeWidth?: number }) {
  const stroke = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} importantForAccessibility="no-hide-descendants">
      {name === 'back' && <Path d="M15 18l-6-6 6-6" {...stroke} />}
      {name === 'chevron' && <Path d="M9 18l6-6-6-6" {...stroke} />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...stroke} />}
      {name === 'more' && (
        <>
          <Circle cx={5} cy={12} r={1.8} fill={color} />
          <Circle cx={12} cy={12} r={1.8} fill={color} />
          <Circle cx={19} cy={12} r={1.8} fill={color} />
        </>
      )}
      {name === 'grid' && (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={1.5} {...stroke} />
          <Rect x={14} y={3} width={7} height={7} rx={1.5} {...stroke} />
          <Rect x={3} y={14} width={7} height={7} rx={1.5} {...stroke} />
          <Rect x={14} y={14} width={7} height={7} rx={1.5} {...stroke} />
        </>
      )}
      {name === 'broadcast' && (
        <>
          <Circle cx={12} cy={12} r={2} {...stroke} />
          <Path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2" {...stroke} />
        </>
      )}
      {name === 'user' && (
        <>
          <Circle cx={12} cy={8} r={4} {...stroke} />
          <Path d="M4 21a8 8 0 0 1 16 0" {...stroke} />
        </>
      )}
      {name === 'flip' && (
        <>
          <Path d="M20 7h-3l-2-3H9L7 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" {...stroke} />
          <Path d="M9 13a3 3 0 0 1 5.2-2M15 13a3 3 0 0 1-5.2 2" {...stroke} />
        </>
      )}
      {name === 'mic' && (
        <>
          <Rect x={9} y={3} width={6} height={11} rx={3} {...stroke} />
          <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...stroke} />
        </>
      )}
      {name === 'micOff' && (
        <>
          <Path d="M3 3l18 18" {...stroke} />
          <Path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.7 3M12 18v3" {...stroke} />
        </>
      )}
      {name === 'sparkle' && <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" {...stroke} />}
      {name === 'volume' && (
        <>
          <Path d="M11 5L6 9H3v6h3l5 4z" {...stroke} />
          <Path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" {...stroke} />
        </>
      )}
      {name === 'eyeOff' && (
        <>
          <Path d="M3 3l18 18" {...stroke} />
          <Path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" {...stroke} />
        </>
      )}
      {name === 'check' && <Path d="M20 6L9 17l-5-5" {...stroke} />}
      {name === 'lock' && (
        <>
          <Rect x={4} y={11} width={16} height={10} rx={2} {...stroke} />
          <Path d="M8 11V7a4 4 0 0 1 8 0v4" {...stroke} />
        </>
      )}
      {name === 'wifi' && (
        <>
          <Path d="M2 8.5a15 15 0 0 1 20 0M5 12a10.5 10.5 0 0 1 14 0M8.5 15.5a5.5 5.5 0 0 1 7 0" {...stroke} />
          <Circle cx={12} cy={19} r={1} fill={color} />
        </>
      )}
      {name === 'wifiOff' && (
        <Path d="M3 3l18 18M8.5 15.5a5.5 5.5 0 0 1 7 0M5 12a10.5 10.5 0 0 1 4.2-2.4M2 8.5a15 15 0 0 1 4.3-2.8M14.8 9.6A10.5 10.5 0 0 1 19 12M17.7 5.7A15 15 0 0 1 22 8.5" {...stroke} />
      )}
      {name === 'battery' && (
        <>
          <Rect x={2} y={7} width={18} height={10} rx={2} {...stroke} />
          <Path d="M22 11v2" {...stroke} />
        </>
      )}
      {name === 'alert' && (
        <>
          <Path d="M12 3l10 18H2z" {...stroke} />
          <Path d="M12 10v5M12 18v.5" {...stroke} />
        </>
      )}
      {name === 'refresh' && (
        <>
          <Path d="M21 12a9 9 0 1 1-2.6-6.4" {...stroke} />
          <Path d="M21 4v5h-5" {...stroke} />
        </>
      )}
      {name === 'close' && <Path d="M18 6L6 18M6 6l12 12" {...stroke} />}
      {name === 'download' && <Path d="M12 3v12M7 10l5 5 5-5M5 21h14" {...stroke} />}
      {name === 'search' && (
        <>
          <Circle cx={11} cy={11} r={7} {...stroke} />
          <Path d="M20 20l-3.5-3.5" {...stroke} />
        </>
      )}
      {name === 'info' && (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M12 11v6M12 7.5v.5" {...stroke} />
        </>
      )}
    </Svg>
  )
}

/** The NegosyoWork Studio mark: a price tag with a play button, its hole the on-air dot. */
export function LogoMark({ size = 36, onBrand = false }: { size?: number; onBrand?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel="NegosyoWork Studio">
      <Path d="M20 6h18a4 4 0 0 1 4 4v18a4 4 0 0 1-1.2 2.8L26.8 44.8a4 4 0 0 1-5.6 0L3.2 26.8a4 4 0 0 1 0-5.6L17.2 7.2A4 4 0 0 1 20 6z" fill={onBrand ? '#FFFFFF' : colors.primary} />
      <Circle cx={33} cy={15} r={4.2} fill={colors.success} />
      <Path d="M17 21.5v11l9-5.5z" fill={onBrand ? colors.navy : '#FFFFFF'} />
    </Svg>
  )
}
