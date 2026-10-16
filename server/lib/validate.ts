import type { SaveSubmission } from '../../shared/types'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase()

export function validate(s: Partial<SaveSubmission>): string | null {
  const email = normEmail(s.email)
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return 'Please enter a valid email address.'
  if (!s.site || typeof s.site.zone !== 'number' || !Array.isArray(s.goals)) return 'Missing forest details.'
  return null
}
