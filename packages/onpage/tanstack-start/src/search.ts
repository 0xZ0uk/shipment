/**
 * Keeps the edit/preview marker (`?_onpage=1`, see `MARKER_PARAM`) in the URL
 * across client-side navigation, so reloads, links opened in a new tab and
 * full-page navigations stay on the marked URL that no edge cache serves.
 *
 *   createFileRoute('/_frontend')({
 *     validateSearch: validateOnPageSearch,
 *     search: { middlewares: [retainOnPageMarker] },
 *   })
 *
 * Visitors never have the marker, so for them this keeps nothing. The marker
 * grants nothing either: the server still checks the sealed cookie or grant.
 */
import { retainSearchParams } from '@tanstack/react-router'
import { MARKER_PARAM } from '@shipment/onpage-core'

export type OnPageSearch = { [MARKER_PARAM]?: '1' }

/** A route's `validateSearch` (or part of one): keeps the marker, drops anything else. */
export const validateOnPageSearch = (search: Record<string, unknown>): OnPageSearch =>
  search[MARKER_PARAM] === undefined ? {} : { [MARKER_PARAM]: '1' }

/** A search middleware copying the marker from the current URL to every link and navigation. */
export const retainOnPageMarker = retainSearchParams<OnPageSearch>([MARKER_PARAM])
