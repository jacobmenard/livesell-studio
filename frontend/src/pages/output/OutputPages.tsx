import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { liveApi, outputApi } from '../../lib/endpoints'
import type { BroadcastTarget } from '../../stage/broadcast'
import { PLATFORMS } from '../../stage/catalog'
import { CleanScreen, type FeedSource } from './CleanScreen'

/** /output/:token — the private Browser Source link for OBS / TikTok LIVE Studio. No login. */
export function LinkOutputPage() {
  const { token = '' } = useParams()
  const source = useMemo<FeedSource>(
    () => ({
      load: () => outputApi.show(token),
      authEndpoint: `/api/output/${encodeURIComponent(token)}/auth`,
      live: { token },
    }),
    [token],
  )
  return <CleanScreen key={token} source={source} />
}

/**
 * /setups/:id/screen — the seller's own clean-screen window, opened from the editor.
 * With ?broadcast=<platform>&quality=<720p|1080p> it can stream straight to that platform.
 */
export function OwnerOutputPage() {
  const id = Number(useParams().id)
  const [params] = useSearchParams()
  const source = useMemo<FeedSource>(
    () => ({
      load: async () => ({ scene: await liveApi.scene(id), channel: `setup.${id}` }),
      authEndpoint: '/api/broadcasting/auth',
      live: { setupId: id },
    }),
    [id],
  )
  const platform = PLATFORMS.find((p) => p.id === params.get('broadcast'))?.id
  const resolution = params.get('quality') === '720p' ? '720p' : '1080p'
  const broadcast = useMemo<BroadcastTarget | undefined>(() => (platform ? { setupId: id, platform, resolution } : undefined), [id, platform, resolution])

  return <CleanScreen key={id} source={source} broadcast={broadcast} />
}
