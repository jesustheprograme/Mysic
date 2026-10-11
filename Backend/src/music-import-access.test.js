const test = require('node:test')
const assert = require('node:assert/strict')
const { hasMusicImportAccess } = require('./music-import-access')

const adminEmail = 'jesusobregon2010@gmail.com'
const googleUser = {
  email: adminEmail,
  googleSub: 'verified-google-subject',
  providers: ['google'],
}

test('grants import access to the configured verified Google account', () => {
  assert.equal(hasMusicImportAccess(googleUser, adminEmail), true)
})

test('normalizes email casing and surrounding whitespace', () => {
  assert.equal(hasMusicImportAccess({ ...googleUser, email: ' JesusObregon2010@Gmail.com ' }, adminEmail), true)
})

test('denies a different email', () => {
  assert.equal(hasMusicImportAccess({ ...googleUser, email: 'someone@example.com' }, adminEmail), false)
})

test('denies password-only accounts even when the email matches', () => {
  assert.equal(hasMusicImportAccess({ email: adminEmail, providers: ['password'] }, adminEmail), false)
})

test('denies a Google provider record without a verified subject', () => {
  assert.equal(hasMusicImportAccess({ email: adminEmail, providers: ['google'] }, adminEmail), false)
})

test('denies all users if no admin email is configured', () => {
  assert.equal(hasMusicImportAccess(googleUser, ''), false)
})
