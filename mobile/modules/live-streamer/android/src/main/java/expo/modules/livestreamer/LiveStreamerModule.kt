package expo.modules.livestreamer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * NegosyoWork Studio's live streamer: the phone's camera and microphone, the seller's
 * popups drawn into the picture and sound effects mixed into the audio, sent straight to
 * Facebook / YouTube / TikTok over RTMP(S). Everything happens on the phone; the stream
 * never passes through the NegosyoWork server.
 *
 * JS side: modules/live-streamer/index.ts
 */
class LiveStreamerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiveStreamer")

    View(LiveStreamerView::class) {
      Events("onStatus", "onStats", "onError")

      Prop("orientation") { view: LiveStreamerView, value: String ->
        view.setOrientation(value == "landscape")
      }

      Prop("resolution") { view: LiveStreamerView, value: String ->
        view.setResolution(if (value == "1080p") Resolution.P1080 else Resolution.P720)
      }

      Prop("facing") { view: LiveStreamerView, value: String ->
        view.setFacing(front = value != "back")
      }

      OnViewDidUpdateProps { view: LiveStreamerView ->
        view.applyConfig()
      }

      OnViewDestroys { view: LiveStreamerView ->
        view.release()
      }

      AsyncFunction("startStream") { view: LiveStreamerView, url: String ->
        view.startStream(url)
      }

      AsyncFunction("stopStream") { view: LiveStreamerView ->
        view.stopStream()
      }

      AsyncFunction("restartStream") { view: LiveStreamerView ->
        view.restartStream()
      }

      AsyncFunction("switchCamera") { view: LiveStreamerView ->
        view.switchCamera()
      }

      AsyncFunction("setMicMuted") { view: LiveStreamerView, muted: Boolean ->
        view.setMicMuted(muted)
      }

      /** JSON array of popup draw specs (src/stage/look.ts PopupDrawSpec), bottom to top. */
      AsyncFunction("setOverlay") { view: LiveStreamerView, json: String ->
        view.setOverlay(json)
      }

      /**
       * Plays a built-in sound effect. `toStream` mixes it into the live's audio (viewers hear
       * it, the microphone doesn't pick it up again); `monitor` also plays it on the speaker.
       */
      AsyncFunction("playSound") { view: LiveStreamerView, id: String, volume: Double, toStream: Boolean, monitor: Boolean ->
        view.playSound(id, volume.toFloat(), toStream, monitor)
      }
    }
  }
}
