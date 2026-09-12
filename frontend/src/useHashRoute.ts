import { useEffect, useState } from 'react'

/**
 * Minimal hash routing.
 *
 * The sidebar already navigates with `#anchor` links, and the app has no
 * router dependency. Rather than add one for a second page, this reads
 * the leading hash segment as the route and leaves anything else to the
 * browser's normal in-page anchor behaviour.
 */
export function useHashRoute(): string {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/')[0] || 'overview'
  const [route, setRoute] = useState(read)

  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}
