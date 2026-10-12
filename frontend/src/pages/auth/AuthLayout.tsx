import type { ReactNode } from 'react'
import { Logo } from '../../components/Logo'
import { ThemeSwitch } from '../../theme/ThemeSwitch'

/** Split screen used by log in, sign up and password screens. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-bg text-text" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))' }}>
      <Showcase />
      <main className="flex items-center justify-center px-[clamp(16px,5vw,64px)] py-12">
        <div className="flex w-full max-w-[400px] flex-col gap-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Logo size={36} variant="full" tone="auto" />
            <ThemeSwitch />
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

/** A sample live picture with popups: what the app is for, at a glance. Decorative. */
function Showcase() {
  return (
    <section aria-hidden="true" className="relative min-h-80 overflow-hidden bg-navy font-display">
      <img src="/backgrounds/rack.svg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
      <svg viewBox="0 0 200 160" className="absolute bottom-0 left-1/2 h-auto w-[62%] max-w-[420px] -translate-x-1/2">
        <circle cx="100" cy="58" r="34" fill="#0D0C10" />
        <path d="M30 160c0-44 30-68 70-68s70 24 70 68z" fill="#0D0C10" />
      </svg>
      <div className="absolute top-[10%] left-[8%] rounded-full bg-primary px-[0.8em] py-[0.42em] text-[26px] leading-none font-extrabold text-white shadow-[0_0.18em_0_rgba(0,0,0,0.35)]">
        LIVE TODAY
      </div>
      <div className="absolute top-[22%] right-[9%] -rotate-6 rounded-[0.28em] bg-promo px-[0.8em] py-[0.42em] text-[34px] leading-none font-extrabold text-ink shadow-[0_0.18em_0_rgba(0,0,0,0.35)]">
        10% OFF
      </div>
      <div className="absolute bottom-[28%] left-[10%] grid h-[3.2em] w-[3.2em] rotate-[8deg] place-items-center rounded-full bg-sky text-[22px] font-extrabold text-ink shadow-[0_0.18em_0_rgba(0,0,0,0.35)]">
        FREE
      </div>
      <div className="absolute right-[8%] bottom-[6%] left-[8%] flex flex-col gap-1.5 rounded-2xl bg-[rgba(13,12,16,0.82)] px-5 py-[18px] font-sans">
        <span className="font-display text-2xl leading-tight font-extrabold text-cream">Your live, set up once.</span>
        <span className="text-[#C9C2D2]">Save your camera, background, popups and sounds as a setup. Open it again in one tap before every live.</span>
      </div>
    </section>
  )
}
