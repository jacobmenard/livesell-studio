import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from './Icon'
import { cx } from './ui'

export interface MenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
}

/**
 * A "⋯" button that opens a short list of actions (the WAI-ARIA menu button pattern): arrow
 * keys move between items, Escape closes it and gives focus back to the button.
 */
export function MoreMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    itemRefs.current[0]?.focus()
    const closeOutside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  const onMenuKey = (e: KeyboardEvent) => {
    const at = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement)
    const move = (to: number) => {
      e.preventDefault()
      itemRefs.current[(to + items.length) % items.length]?.focus()
    }
    if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(items.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div ref={root} className="relative inline-flex">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="grid h-9 w-9 place-items-center rounded-full border-0 bg-transparent text-text-2 transition-colors duration-150 hover:bg-tint hover:text-text motion-reduce:transition-none"
      >
        <Icon name="more" size={20} strokeWidth={2.5} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className="absolute top-full right-0 z-40 mt-1 flex min-w-44 flex-col rounded-xl border border-line bg-surface p-1 shadow-[0_10px_30px_rgba(0,0,0,0.14)]"
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close()
                item.onSelect()
              }}
              className={cx(
                'flex min-h-10 w-full items-center rounded-lg border-0 bg-transparent px-3 text-left text-sm font-semibold hover:bg-tint focus:bg-tint',
                item.danger ? 'text-danger-text' : 'text-text',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
