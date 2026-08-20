/**
 * The one breakpoint the app has, for the behaviours that can't be expressed in
 * CSS alone.
 *
 * A scroll handler that hides mobile chrome has to agree with the media query
 * that positions it, or it spends desktop cycles moving something that isn't
 * there. Shared so the two can't drift apart.
 */
const MOBILE_QUERY = '(max-width: 767px)';

export { MOBILE_QUERY };
