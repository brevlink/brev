// Ownership and HTTPS readiness are separate. Null is used by deployments
// that terminate customer TLS themselves, so they only require TXT verification.
export function domainPublishingIssue(domain) {
  if (!domain.is_verified) return 'TXT ownership verification pending.';
  if (domain.cloudflare_status != null && domain.cloudflare_status !== 'active') {
    return 'Certificate pending.';
  }
  return '';
}
