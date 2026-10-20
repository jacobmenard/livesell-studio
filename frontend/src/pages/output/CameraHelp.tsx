import { CAMERA_MESSAGES, type CameraStatus } from '../../stage/useCamera'

/** Camera states where the clean screen would otherwise show no camera and no reason. */
export const CAMERA_FAILED: ReadonlySet<CameraStatus> = new Set(['denied', 'not-found', 'busy', 'unsupported', 'error'])

/** OBS's Browser Source exposes `window.obsstudio`; TikTok LIVE Studio's has no marker. */
const inObs = () => typeof window !== 'undefined' && 'obsstudio' in window

/**
 * Shown on the clean screen in place of a camera that couldn't open. In a Browser Source
 * (OBS, TikTok LIVE Studio) that is expected: their built-in browser may not open webcams,
 * and Windows lets only one app use a webcam. It says what to do instead, and goes away as
 * soon as the camera works (or see-through is turned on).
 */
export function CameraHelp({ status, browserSource }: { status: CameraStatus; browserSource: boolean }) {
  const app = inObs() ? 'OBS' : 'TikTok LIVE Studio or OBS'
  const busy = status === 'busy'

  return (
    <div role="alert" className="absolute inset-0 z-[5] grid place-items-center bg-[#0D0C10]/85 p-[4%] font-sans text-white">
      <div className="flex max-w-[760px] flex-col gap-4 rounded-3xl bg-[#1B1A21] p-8 text-[22px] leading-snug shadow-2xl">
        <p className="m-0 text-[30px] font-bold">{busy ? 'Your camera is being used by another app' : 'The camera can’t open here'}</p>
        {browserSource ? (
          <>
            <p className="m-0 text-white/80">
              {busy
                ? `${app} (or another app) is already using this camera, and Windows lets only one app use a webcam at a time.`
                : `A Browser Source in ${app} isn’t allowed to open your webcam.`}{' '}
              Choose one of these instead:
            </p>
            <ol className="m-0 flex list-decimal flex-col gap-2 pl-7 text-white/90">
              <li>
                <strong>Keep your background and face effects:</strong> in NegosyoWork Studio click <strong>Open clean screen</strong>, then add that Chrome
                window here as a <strong>Window Capture</strong> (remove this Browser Source).
              </li>
              <li>
                <strong>Use {app}’s camera:</strong> in Go live turn on <strong>See-through background</strong>, then add your camera here as a{' '}
                <strong>Video Capture Device</strong> placed under this source.
              </li>
            </ol>
          </>
        ) : (
          <p className="m-0 text-white/80">{CAMERA_MESSAGES[status]}</p>
        )}
        <p className="m-0 text-[16px] text-white/50">This message is shown only while the camera isn’t working.</p>
      </div>
    </div>
  )
}
