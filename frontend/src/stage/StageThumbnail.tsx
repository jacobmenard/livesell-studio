import type { Scene } from '../lib/types'
import { BACKGROUND_BY_ID } from './catalog'
import { ForegroundLayer, PopupLayer, StageFrame } from './Stage'

/**
 * A still picture of a setup for dashboard cards: its background, a stand-in for the
 * seller, and the popups that were last on screen. No camera, no animation.
 */
export function StageThumbnail({ scene }: { scene: Scene }) {
  const bg = scene.background
  const preset = BACKGROUND_BY_ID[bg.preset] ?? BACKGROUND_BY_ID.rack
  const picture = bg.mode === 'image' || bg.mode === 'green' ? (bg.media_url ?? preset.src) : null
  const portrait = scene.orientation === 'portrait'

  return (
    <div className="relative flex aspect-video justify-center bg-[#08070A]">
      <div className="h-full" style={{ aspectRatio: portrait ? '9 / 16' : '16 / 9' }}>
        <StageFrame orientation={scene.orientation} style={{ height: '100%', width: 'auto', backgroundColor: picture ? preset.tone : '#2A2730' }}>
          {picture ? (
            <img src={picture} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="ph-stripes absolute inset-0" style={{ filter: bg.mode === 'blur' ? 'blur(2px)' : undefined }} />
          )}
          <svg viewBox="0 0 200 160" aria-hidden="true" className="absolute bottom-0 left-1/2 h-auto -translate-x-1/2" style={{ width: portrait ? '80%' : '36%' }}>
            <circle cx="100" cy="58" r="34" fill="#0D0C10" />
            <path d="M30 160c0-44 30-68 70-68s70 24 70 68z" fill="#0D0C10" />
          </svg>
          <ForegroundLayer foreground={scene.foreground} />
          <PopupLayer popups={scene.popups} animate={false} />
        </StageFrame>
      </div>
    </div>
  )
}
