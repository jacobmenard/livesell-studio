import { useEffect, useState } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { canReloadForNewVersion, isStaleBuildError, reloadForNewVersion } from '../lib/staleBuild'
import { Button } from './ui'

/** Shown instead of a page that failed to load or crashed. */
export function RouteError() {
  const error = useRouteError()
  const stale = isStaleBuildError(error)
  // A page from an older build: reload once to get the new version (the message shows meanwhile).
  const [reloading] = useState(() => stale && canReloadForNewVersion())

  useEffect(() => {
    if (reloading) reloadForNewVersion()
    else if (!stale) console.error('[app] page error', error)
  }, [error, stale, reloading])

  const notFound = isRouteErrorResponse(error) && error.status === 404
  let title = 'Something went wrong'
  let detail = 'This page couldn’t be shown. Reload to try again.'
  if (stale) {
    title = 'A new version is ready'
    detail = reloading ? 'Loading the new version of NegosyoWork Studio…' : 'NegosyoWork Studio was updated. Reload to get the new version.'
  } else if (notFound) {
    title = 'Page not found'
    detail = 'This page doesn’t exist.'
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-text">
      <div className="flex max-w-md flex-col items-center gap-3">
        <h1 className="m-0 font-display text-3xl font-extrabold">{title}</h1>
        <p className="m-0 text-text-2">{detail}</p>
        {!reloading && (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {!notFound && (
              <Button variant="primary" onClick={() => window.location.reload()}>
                Reload
              </Button>
            )}
            <a href="/setups" className="inline-flex min-h-11 items-center px-3 font-semibold">
              Go to my setups
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
