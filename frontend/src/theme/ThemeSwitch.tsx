import { Icon, type IconName } from '../components/Icon'
import { cx } from '../components/ui'
import type { ThemePref } from '../lib/types'
import { useTheme } from './ThemeProvider'

const OPTIONS: { id: ThemePref; label: string; aria: string; icon: IconName }[] = [
  { id: 'light', label: 'Light', aria: 'Light mode', icon: 'sun' },
  { id: 'dark', label: 'Dark', aria: 'Dark mode', icon: 'moon' },
  { id: 'system', label: 'Auto', aria: 'Match my device', icon: 'monitor' },
]

/** Shared theme picker shown in every top bar, as an iOS segmented control (onBrand: on the navy bars). */
export function ThemeSwitch({ showLabels = false, onBrand = false }: { showLabels?: boolean; onBrand?: boolean }) {
  const { pref, setPref } = useTheme()
  return (
    <div role="group" aria-label="Color theme" className={cx('inline-flex gap-0.5 rounded-full p-0.5', onBrand ? 'bg-white/12 text-white' : 'bg-segment-track text-text')}>
      {OPTIONS.map((o) => {
        const on = o.id === pref
        let tone = onBrand ? 'bg-transparent text-white/75 hover:text-white' : 'bg-transparent text-text-2 hover:text-text'
        if (on) tone = onBrand ? 'bg-white text-navy shadow-[0_3px_8px_rgba(0,0,0,0.18)]' : 'bg-segment-on text-segment-on-text shadow-[0_3px_8px_rgba(0,0,0,0.12)]'
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            aria-label={o.aria}
            title={o.label}
            onClick={() => setPref(o.id)}
            className={cx(
              'inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border-0 px-3 text-[13px] font-semibold transition-colors duration-150 motion-reduce:transition-none',
              tone,
            )}
          >
            <Icon name={o.icon} />
            {showLabels && <span>{o.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
