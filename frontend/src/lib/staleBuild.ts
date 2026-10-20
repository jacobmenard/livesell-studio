// Every build gives its files new names and a deploy deletes the old ones, so a tab opened
// before a deploy can ask for a page file that's gone. Reloading loads the new version.

const RELOADED_AT = 'negosyowork:reloaded-for-new-version'

/** A page file (or its CSS) from an older build failed to load: Chrome, Safari or Firefox wording. */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(message)
}

/** At most one reload a minute, so a real outage can't loop (and none if storage is blocked). */
export function canReloadForNewVersion(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) >= 60_000
  } catch {
    return false
  }
}

/** Reloads to pick up the new version. False when it didn't: show an error instead. */
export function reloadForNewVersion(): boolean {
  if (!canReloadForNewVersion()) return false
  try {
    sessionStorage.setItem(RELOADED_AT, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}
