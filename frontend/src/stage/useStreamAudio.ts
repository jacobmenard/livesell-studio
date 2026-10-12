import { useEffect } from 'react'

/**
 * Plays a camera stream's sound so OBS / TikTok LIVE Studio capture it with the picture.
 * Only the clean screen uses this; the editor stays silent so sellers don't hear themselves.
 */
export function useStreamAudio(stream: MediaStream | null) {
  useEffect(() => {
    const tracks = stream?.getAudioTracks() ?? []
    if (tracks.length === 0) return

    const audio = new Audio()
    audio.srcObject = new MediaStream(tracks)
    const play = () => {
      audio.play().catch(() => {
        /* held back until the first click in a normal browser window (OBS plays straight away) */
      })
    }
    play()
    window.addEventListener('pointerdown', play)
    window.addEventListener('keydown', play)
    return () => {
      window.removeEventListener('pointerdown', play)
      window.removeEventListener('keydown', play)
      audio.pause()
      audio.srcObject = null
    }
  }, [stream])
}
