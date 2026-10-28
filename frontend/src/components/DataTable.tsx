import type { ReactNode } from 'react'
import { cx } from './ui'

export interface Column<T> {
  header: string
  cell: (row: T) => ReactNode
  /** Header read by screen readers only (e.g. the actions column); not repeated on phones either. */
  hideHeader?: boolean
  align?: 'left' | 'right'
  className?: string
}

/**
 * A list of records as a table. The first column names the row (a row header for screen
 * readers). Below the md breakpoint each row stacks into a card with each value under its
 * column's name, so nothing scrolls sideways or clips a menu.
 */
export function DataTable<T>({ caption, columns, rows, rowKey }: { caption: string; columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string | number }) {
  return (
    <table className="w-full border-collapse text-sm max-md:block">
      <caption className="sr-only">{caption}</caption>
      <thead className="max-md:sr-only">
        <tr>
          {columns.map((c) => (
            <th
              key={c.header}
              scope="col"
              className={cx('px-3 pt-1 pb-2 text-[13px] font-semibold text-muted first:pl-0 last:pr-0', c.align === 'right' ? 'text-right' : 'text-left', c.hideHeader && 'sr-only')}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="max-md:block">
        {rows.map((row) => (
          <tr key={rowKey(row)} className="border-t border-line max-md:flex max-md:flex-col max-md:gap-2 max-md:py-3">
            {columns.map((c, i) => {
              const Cell = i === 0 ? 'th' : 'td'
              return (
                <Cell
                  key={c.header}
                  scope={i === 0 ? 'row' : undefined}
                  data-label={c.hideHeader || i === 0 ? undefined : c.header}
                  className={cx(
                    'px-3 py-3 align-middle font-normal first:pl-0 last:pr-0 max-md:block max-md:p-0',
                    c.align === 'right' ? 'text-right max-md:text-left' : 'text-left',
                    'max-md:before:block max-md:before:text-xs max-md:before:font-semibold max-md:before:text-muted max-md:before:content-[attr(data-label)]',
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </Cell>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
