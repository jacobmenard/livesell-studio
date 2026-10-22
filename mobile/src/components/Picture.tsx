import { Image, type ImageProps } from 'expo-image'

/** A server address ({ uri }) or a bundled picture (require()). */
export type PictureSource = ImageProps['source']

/**
 * A picture from the server or the app's own assets. Uses expo-image rather than React
 * Native's Image because on Android it:
 *  - plays GIFs (and animated WebP); React Native's Image shows only their first frame,
 *  - decodes each picture at the size it's shown (uploads are up to 5 MB, tiles are small),
 *  - keeps pictures in memory and on disk, so tiles and previews show at once next time.
 */
export function Picture({ fit = 'cover', ...props }: Omit<ImageProps, 'contentFit'> & { fit?: ImageProps['contentFit'] }) {
  return <Image contentFit={fit} cachePolicy="memory-disk" transition={120} {...props} />
}
