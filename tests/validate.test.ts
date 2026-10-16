import { describe, expect, it } from 'vitest'
import { normEmail, validate } from '../server/lib/validate'
import type { Site } from '../shared/types'

const site = { label: 'Hebron, MD', country: 'US', zone: 7.5, zoneLabel: '7b' } as Site

describe('save validation', () => {
  it('normalises emails', () => expect(normEmail('  A@B.Co ')).toBe('a@b.co'))
  it('accepts a real submission', () => expect(validate({ email: 'a@b.com', site, goals: ['money'] })).toBeNull())
  it('rejects bad emails', () => {
    for (const email of ['', 'nope', 'a@b', 'a b@c.com', 'x'.repeat(260) + '@b.com']) expect(validate({ email, site, goals: [] })).toMatch(/valid email/)
  })
  it('rejects missing forest details', () => {
    expect(validate({ email: 'a@b.com' })).toMatch(/forest/)
    expect(validate({ email: 'a@b.com', site, goals: 'money' as any })).toMatch(/forest/)
  })
})
