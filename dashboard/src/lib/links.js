/**
 * Single-use tokens arrive in the URL fragment (`#token=...`), never in the query
 * string: fragments are not sent to the server, so they stay out of access logs,
 * and email scanners do not follow them. That is why the confirmation page can
 * safely consume the token as soon as it loads.
 */
export function tokenFromFragment() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return '';
  return new URLSearchParams(hash).get('token') || '';
}
