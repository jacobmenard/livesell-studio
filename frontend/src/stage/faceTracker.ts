import type { FaceLandmarker } from '@mediapipe/tasks-vision'

/**
 * Face tracking for camera effects (flower crown, puppy ears…), using MediaPipe's face
 * landmarker: 478 points per face, in the video's normalized coordinates. Like background
 * removal, the runtime comes from our own /mediapipe/wasm and the model URL is configurable
 * so production can self-host it.
 */
export const DEFAULT_FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

let loading: Promise<FaceLandmarker> | null = null

export function loadFaceTracker(): Promise<FaceLandmarker> {
  if (!loading) {
    loading = (async () => {
      // Loaded only when an effect is picked, so it never slows down anything else.
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
      const modelAssetPath = import.meta.env.VITE_FACE_MODEL_URL || DEFAULT_FACE_MODEL_URL
      const create = (delegate: 'GPU' | 'CPU') =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
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
