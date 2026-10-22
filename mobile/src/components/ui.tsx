import { useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, radius, space, TOUCH } from '@/theme'
import { Icon, type IconName } from './Icon'

// ---- buttons -------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'onBrand'

const BUTTON_BG: Record<ButtonVariant, string> = {
  primary: colors.primary,
  secondary: colors.surface2,
  danger: colors.dangerSolid,
  ghost: 'transparent',
  onBrand: '#FFFFFF',
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  dot = false,
  disabled = false,
  busy = false,
  size = 'lg',
  style,
  accessibilityLabel,
}: {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  icon?: IconName
  /** The white on-air dot of the "Go live" buttons. */
  dot?: boolean
  disabled?: boolean
  busy?: boolean
  size?: 'lg' | 'md'
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}) {
  const fg = variant === 'onBrand' ? colors.navy : variant === 'ghost' ? colors.text2 : colors.text
  const inactive = disabled || busy
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.button,
        size === 'md' && styles.buttonMd,
        { backgroundColor: BUTTON_BG[variant], opacity: inactive ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {dot && <View style={styles.dot} />}
          {icon && <Icon name={icon} size={20} color={fg} />}
          <Text style={[styles.buttonText, size === 'md' && styles.buttonTextMd, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  )
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'surface',
  size = TOUCH,
  disabled,
}: {
  icon: IconName
  label: string
  onPress: () => void
  tone?: 'surface' | 'overlay' | 'plain'
  size?: number
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: tone === 'overlay' ? size / 2 : radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tone === 'overlay' ? colors.overlay : tone === 'plain' ? 'transparent' : colors.surface2,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Icon name={icon} size={22} />
    </Pressable>
  )
}

// ---- text fields -----------------------------------------------------------------------

export function Field({
  label,
  error,
  help,
  secret = false,
  style,
  ...input
}: TextInputProps & { label: string; error?: string; help?: string; secret?: boolean }) {
  const [shown, setShown] = useState(false)
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.label}>{label}</Text>
      <View>
        <TextInput
          placeholderTextColor={colors.muted}
          selectionColor={colors.link}
          secureTextEntry={secret && !shown}
          accessibilityLabel={label}
          style={[styles.input, secret && { paddingRight: 76 }, error ? { borderColor: colors.dangerText } : null]}
          {...input}
        />
        {secret && (
          <Pressable
            onPress={() => setShown((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            style={styles.show}
          >
            <Text style={{ color: colors.link, fontSize: 15, fontWeight: '500' }}>{shown ? 'Hide' : 'Show'}</Text>
          </Pressable>
        )}
      </View>
      {error ? (
        <Text style={{ color: colors.dangerText, fontSize: 13 }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : help ? (
        <Text style={styles.help}>{help}</Text>
      ) : null}
    </View>
  )
}

// ---- layout bits ------------------------------------------------------------------------

export function ScreenHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack && <IconButton icon="back" label="Back" onPress={onBack} tone="plain" />}
      <View style={{ flex: 1, minWidth: 0, paddingLeft: onBack ? 0 : space.sm }}>
        <Text style={{ color: colors.text, fontSize: onBack ? 18 : 28, fontWeight: '700' }} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  )
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segment}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.segmentItem, on && { backgroundColor: colors.segmentOn }]}
          >
            <Text style={{ color: on ? colors.text : colors.text2, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' }, style]}>{children}</View>
}

export function Row({
  label,
  value,
  onPress,
  danger = false,
  last = false,
  valueTone = 'muted',
}: {
  label: string
  value?: string
  onPress?: () => void
  danger?: boolean
  last?: boolean
  valueTone?: 'muted' | 'link'
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { backgroundColor: colors.surface2 }]}
    >
      <Text style={{ flex: 1, color: danger ? colors.dangerText : colors.text, fontSize: 16, fontWeight: danger ? '500' : '400' }}>{label}</Text>
      {value ? <Text style={{ color: valueTone === 'link' ? colors.link : colors.muted, fontSize: 14, fontWeight: valueTone === 'link' ? '500' : '400' }}>{value}</Text> : null}
      {onPress && !danger ? <Icon name="chevron" size={18} color={colors.muted} /> : null}
    </Pressable>
  )
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: string; children: ReactNode }) {
  const icon: IconName = tone === 'success' ? 'lock' : tone === 'info' ? 'info' : 'alert'
  const color = tone === 'success' ? colors.successText : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.dangerText : colors.link
  return (
    <View style={styles.notice} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={icon} size={20} color={color} />
      <View style={{ flex: 1, gap: 3 }}>
        {title ? <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{title}</Text> : null}
        <Text style={{ color: colors.text2, fontSize: 14, lineHeight: 20 }}>{children}</Text>
      </View>
    </View>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label}>
      <ActivityIndicator color={colors.link} size="large" />
    </View>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.center, { gap: space.lg, padding: space.xxl }]}>
      <Icon name="wifiOff" size={32} color={colors.muted} />
      <Text style={{ color: colors.text2, fontSize: 16, textAlign: 'center', lineHeight: 22 }}>{message}</Text>
      {onRetry && <Button label="Try again" onPress={onRetry} variant="secondary" size="md" />}
    </View>
  )
}

/** A bottom sheet over a dimmed screen (popup settings, sound pads, update, confirmations). */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: space.xl + insets.bottom }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }} accessibilityRole="header">
              {title}
            </Text>
            <IconButton icon="close" label={`Close ${title.toLowerCase()}`} onPress={onClose} size={44} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonMd: { minHeight: TOUCH, borderRadius: 12, paddingHorizontal: 14 },
  buttonText: { fontSize: 17, fontWeight: '700' },
  buttonTextMd: { fontSize: 15 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
  label: { color: colors.text2, fontSize: 14, fontWeight: '500' },
  help: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: space.lg,
  },
  show: { position: 'absolute', right: 4, top: 4, height: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingTop: space.sm },
  segment: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 12, backgroundColor: colors.surface2 },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  notice: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    // On tablets a sheet stays phone-width, centred, instead of spanning the screen.
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.lg,
    paddingTop: 10,
    gap: space.md,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong },
})
