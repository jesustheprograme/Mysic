const assert = require('node:assert/strict')
const test = require('node:test')
const { buildGoogleLinkChanges, googleVerificationMessage } = require('./auth')

test('links Google to an existing password account with the same verified email', () => {
  const updatedAt = new Date('2026-10-10T00:00:00Z')
  const changes = buildGoogleLinkChanges(
    { providers: ['password'], avatarUrl: null },
    { sub: 'google-user-123', picture: 'https://example.com/avatar.jpg' },
    updatedAt,
  )

  assert.deepEqual(changes, {
    avatarUrl: 'https://example.com/avatar.jpg',
    googleSub: 'google-user-123',
    providers: ['password', 'google'],
    updatedAt,
  })
})

test('explains when Google issued the credential for another client', () => {
  const message = googleVerificationMessage(new Error('Wrong recipient, payload audience != requiredAudience'))

  assert.match(message, /otro entorno/i)
})

test('explains when the Google credential expired', () => {
  const message = googleVerificationMessage(new Error('Token used too late, expired at 123'))

  assert.match(message, /vencio/i)
})

test('keeps an actionable fallback for other verification failures', () => {
  const message = googleVerificationMessage(new Error('certificate fetch failed'))

  assert.match(message, /intenta de nuevo/i)
})
