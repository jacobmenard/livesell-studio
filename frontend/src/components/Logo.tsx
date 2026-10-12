const TAG = 'M20 6h18a4 4 0 0 1 4 4v18a4 4 0 0 1-1.2 2.8L26.8 44.8a4 4 0 0 1-5.6 0L3.2 26.8a4 4 0 0 1 0-5.6L17.2 7.2A4 4 0 0 1 20 6z'
const PLAY = 'M17 21.5v11l9-5.5z'

const NAVY = '#062B63'
const BLUE = '#0B63CE'
const GREEN = '#27D978'

type Variant = 'full' | 'mark' | 'icon'
type Tone = 'auto' | 'onBrand'

/**
 * The NegosyoWork Studio logo: a price tag with a play button, whose hole is the green
 * on-air dot. "auto" follows the app theme; "onBrand" is white for the navy bars.
 */
export function Logo({ size = 40, variant = 'full', tone = 'auto' }: { size?: number; variant?: Variant; tone?: Tone }) {
  const px = Math.min(240, Math.max(12, size))
  const onBrand = tone === 'onBrand'

  if (variant === 'icon') {
    return (
      <span
        role="img"
        aria-label="NegosyoWork Studio"
        style={{ width: px, height: px, borderRadius: Math.round(px * 0.22), backgroundColor: NAVY, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}
      >
        <svg width={Math.round(px * 0.64)} height={Math.round(px * 0.64)} viewBox="0 0 48 48" aria-hidden="true" style={{ display: 'block' }}>
          <path d={TAG} fill="#FFFFFF" />
          <circle cx="33" cy="15" r="4.2" fill={GREEN} />
          <path d={PLAY} fill={NAVY} />
        </svg>
      </span>
    )
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(px * 0.3),
        fontFamily: 'var(--font-display)',
        color: onBrand ? '#FFFFFF' : 'var(--text)',
        lineHeight: 1,
      }}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 48 48"
        role={variant === 'mark' ? 'img' : undefined}
        aria-label={variant === 'mark' ? 'NegosyoWork Studio' : undefined}
        aria-hidden={variant === 'full' ? true : undefined}
        style={{ display: 'block', flexShrink: 0 }}
      >
        <path d={TAG} fill={onBrand ? '#FFFFFF' : BLUE} />
        <circle cx="33" cy="15" r="4.2" fill={GREEN} />
        <path d={PLAY} fill={onBrand ? NAVY : '#FFFFFF'} />
      </svg>
      {variant === 'full' && (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.22em', fontSize: Math.round(px * 0.66), letterSpacing: '-0.025em', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 800 }}>NegosyoWork</span>
          <span style={{ fontWeight: 500, opacity: onBrand ? 0.75 : 1, color: onBrand ? undefined : 'var(--muted)' }}>Studio</span>
        </span>
      )}
    </span>
  )
}
