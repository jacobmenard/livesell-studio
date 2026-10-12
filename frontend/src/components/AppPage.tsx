import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'

/** The signed-in page frame: header and the navy title banner, then the page column. */
export function AppPage({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <AppHeader />
      <PageBanner title={title} subtitle={subtitle} actions={actions} width="max-w-[1100px]" />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-6 px-[clamp(16px,3vw,32px)] pt-6 pb-16">{children}</main>
    </div>
  )
}

/** The page title on the navy brand banner, under the header. */
export function PageBanner({ title, subtitle, actions, width }: { title: string; subtitle?: ReactNode; actions?: ReactNode; width: string }) {
  return (
    <section className="on-brand bg-navy text-white">
      <div className={`mx-auto flex flex-wrap items-end justify-between gap-4 px-[clamp(16px,3vw,32px)] pt-6 pb-7 ${width}`}>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-display text-[clamp(30px,3.4vw,40px)] leading-[1.08] font-bold tracking-[-0.025em]">{title}</h1>
          {subtitle && <p className="m-0 max-w-[70ch] text-white/75">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </section>
  )
}
