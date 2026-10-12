import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse' | 'onBrand' | 'onBrandSoft'

/** iOS button styles: filled, tinted, plain, destructive, plus white and soft white on the navy brand bars. */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:brightness-110',
  secondary: 'bg-tint text-link hover:bg-tint-hover',
  ghost: 'bg-transparent text-link hover:bg-tint',
  danger: 'bg-danger-solid text-on-danger hover:brightness-110',
  inverse: 'bg-inverse-bg text-inverse-fg hover:brightness-110',
  onBrand: 'bg-white text-primary hover:bg-white/90',
  onBrandSoft: 'bg-white/12 text-white hover:bg-white/20',
}

/** A capsule button that dims and shrinks slightly while pressed, like on an iPhone. */
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'md' | 'lg' | 'sm'; loading?: boolean }
>(function Button({ variant = 'secondary', size = 'md', loading = false, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full border-0 font-semibold tracking-[-0.01em] whitespace-nowrap',
        'transition-[transform,opacity,background-color,filter] duration-150 ease-out active:scale-[0.97] active:opacity-80',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100',
        size === 'lg' && 'min-h-[50px] px-6 text-[17px]',
        size === 'md' && 'min-h-11 px-5 text-[15px]',
        size === 'sm' && 'min-h-9 px-3.5 text-[13px]',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  )
})

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="spinner" style={{ borderColor: 'color-mix(in srgb, var(--text) 25%, transparent)', borderTopColor: 'var(--text)' }} aria-hidden="true" />
      {label}
    </span>
  )
}

export function Alert({ tone = 'error', children, className }: { tone?: 'error' | 'info' | 'success'; children: ReactNode; className?: string }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'm-0 rounded-2xl px-4 py-3 text-sm',
        tone === 'error' && 'bg-danger-bg text-danger-text',
        tone === 'info' && 'bg-surface-2 text-text-2',
        tone === 'success' && 'border border-success/40 bg-success/10 text-text',
        className,
      )}
    >
      {children}
    </p>
  )
}

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode; labelAside?: ReactNode; trailing?: ReactNode }
>(function TextField({ label, error, hint, labelAside, trailing, id, className, ...rest }, ref) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errId = `${inputId}-err`
  const hintId = `${inputId}-hint`
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative flex">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(error ? errId : null, hint ? hintId : null) || undefined}
          className={cx(
            'min-h-12 w-full min-w-0 rounded-xl border bg-surface px-3.5 text-text transition-colors placeholder:text-muted',
            error ? 'border-danger-line' : 'border-line-strong focus:border-primary',
            trailing ? 'pr-16' : '',
            className,
          )}
          {...rest}
        />
        {trailing}
      </div>
      {error && (
        <p id={errId} className="m-0 text-[13px] text-danger-text">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="m-0 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  )
})

/** Password input with a Show / Hide toggle. */
export const PasswordField = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; error?: string; hint?: ReactNode; labelAside?: ReactNode }>(
  function PasswordField(props, ref) {
    const [shown, setShown] = useState(false)
    return (
      <TextField
        ref={ref}
        {...props}
        type={shown ? 'text' : 'password'}
        trailing={
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-pressed={shown}
            aria-label={shown ? 'Hide password' : 'Show password'}
            className="absolute top-1 right-1 bottom-1 rounded-lg px-3 text-[13px] font-semibold text-link"
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        }
      />
    )
  },
)

/** An on/off switch with a visible label. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'flex h-[31px] w-[51px] shrink-0 items-center rounded-full border-0 p-[2px] transition-colors duration-200 disabled:opacity-50 motion-reduce:transition-none',
          checked ? 'bg-success' : 'bg-track-off',
        )}
      >
        <span
          className={cx(
            'h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform duration-200 motion-reduce:transition-none',
            checked && 'translate-x-5',
          )}
        />
      </button>
      <span id={`${id}-l`} className="text-sm leading-snug">
        {label}
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </div>
  )
}

export interface SegmentOption<T extends string | number> {
  id: T
  label: ReactNode
}

/** A row of mutually exclusive buttons (aria-pressed): an iOS segmented control. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  disabled,
  columns,
}: {
  label: string
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  disabled?: boolean
  columns?: number
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx('gap-0.5 rounded-[10px] bg-segment-track p-0.5', columns ? 'grid' : 'flex')}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={String(o.id)}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            className={cx(
              'flex-1 rounded-[8px] border-0 px-2 font-semibold transition-[background-color,color,box-shadow] duration-150 disabled:opacity-60 motion-reduce:transition-none',
              size === 'sm' ? 'min-h-9 text-[13px]' : 'min-h-10 text-sm',
              on ? 'bg-segment-on text-segment-on-text shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)]' : 'bg-transparent text-text-2 hover:text-text',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Panel({ title, subtitle, children, className, headingId }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string; headingId?: string }) {
  return (
    <section aria-labelledby={headingId} className={cx('flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-[18px]', className)}>
      {(title || subtitle) && (
        <div className="flex flex-col gap-0.5">
          {title && (
            <h2 id={headingId} className="m-0 font-display text-xl font-semibold">
              {title}
            </h2>
          )}
          {subtitle && <span className="text-[13px] text-muted">{subtitle}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

/** A dashed drop tile wrapping a hidden file input (keyboard focus shows on the tile). */
export function UploadTile({
  label,
  hint,
  accept,
  onFile,
  busy,
  className,
}: {
  label: string
  hint?: string
  accept: string
  onFile: (file: File) => void
  busy?: boolean
  className?: string
}) {
  const id = useId()
  return (
    <div
      className={cx(
        'relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong p-2 text-center text-xs text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
        className,
      )}
    >
      {busy ? <span className="spinner" style={{ borderColor: 'color-mix(in srgb, var(--text) 25%, transparent)', borderTopColor: 'var(--text)' }} aria-hidden="true" /> : <UploadIcon />}
      <label htmlFor={id} className="font-semibold text-text-2">
        {busy ? 'Uploading…' : label}
      </label>
      {hint && <span className="text-[11px]">{hint}</span>}
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={busy}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
    </div>
  )
}

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </svg>
  )
}

export { cx }
