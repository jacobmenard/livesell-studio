import type { ImageSegmenter } from '@mediapipe/tasks-vision'

/**
 * Person segmentation for Blur and Picture backgrounds (no green cloth needed), using
 * MediaPipe's selfie segmenter. The runtime is served from our own /mediapipe/wasm
 * (copied at build time); the model URL is configurable so production can self-host it.
 */
export const DEFAULT_SEGMENTER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'

let loading: Promise<ImageSegmenter> | null = null

export function loadSegmenter(): Promise<ImageSegmenter> {
  if (!loading) {
    loading = (async () => {
      // Loaded on demand so the 1 MB+ runtime never slows down the rest of the app.
      const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
      const modelAssetPath = import.meta.env.VITE_SEGMENTER_MODEL_URL || DEFAULT_SEGMENTER_MODEL_URL
      const create = (delegate: 'GPU' | 'CPU') =>
        ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        })
      try {
        return await create('GPU')
      } catch {
        return await create('CPU')
      }
    })()
    // Let a later attempt retry (e.g. after the network comes back).
    loading.catch(() => {
      loading = null
    })
  }
  return loading
}
